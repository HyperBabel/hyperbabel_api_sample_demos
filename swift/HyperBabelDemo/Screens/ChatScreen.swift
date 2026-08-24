/*
 * Chat screen — full HyperBabel chat surface with:
 *   - Real-time message + typing events
 *   - Edit / delete on own messages, Reply / React on any
 *   - Image and arbitrary-file upload via the 3-step presign flow
 *   - Members modal with promote / demote / ban + room mute toggle
 *   - Freeze toggle for owner / sub_admin
 *   - Locale-aware timestamps + edited indicator
 */
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ChatScreen: View {
    let roomId: String
    let onBack: () -> Void
    let onStartCall: () -> Void

    @EnvironmentObject var session: Session
    @State private var messages: [Message] = []
    @State private var input: String = ""
    @State private var error: String = ""
    @State private var sending = false
    @State private var unsubscribe: (() -> Void)?

    @State private var role: String = "member"
    @State private var isFrozen = false
    @State private var isMuted = false
    @State private var typingFrom: String?
    @State private var typingClearTask: Task<Void, Never>?
    @State private var lastTypingPing = Date.distantPast
    @State private var replyTo: Message?

    @State private var actionFor: Message?
    @State private var editFor: Message?
    @State private var editText: String = ""
    @State private var reactionFor: Message?
    @State private var showMembers = false

    @State private var showPhotoPicker = false
    @State private var photoSelection: PhotosPickerItem?
    @State private var fileImporterShown = false

    private var canModerate: Bool { role == "owner" || role == "sub_admin" }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if !error.isEmpty {
                Text(error).foregroundStyle(.red).font(.caption).padding(.horizontal, 12)
            }
            if isFrozen {
                Text(canModerate
                     ? "🔒 This room is frozen — only admins can post."
                     : "🔒 This room is frozen — only admins can post right now.")
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(Color.orange.opacity(0.15))
                    .foregroundStyle(.orange)
            }
            messagesList
            if let t = typingFrom {
                Text("\(t) is typing…")
                    .font(.caption2).foregroundStyle(.secondary)
                    .padding(.horizontal, 12).padding(.bottom, 2)
            }
            replyBanner
            inputRow
        }
        .navigationBarBackButtonHidden(true)
        .task { await bootstrap() }
        .onDisappear { unsubscribe?(); typingClearTask?.cancel() }
        .confirmationDialog("Action", isPresented: actionDialogBinding, titleVisibility: .hidden) {
            actionDialogButtons
        }
        .alert("Edit message", isPresented: editDialogBinding) {
            TextField("Message", text: $editText)
            Button("Save") { Task { await saveEdit() } }
            Button("Cancel", role: .cancel) { editFor = nil }
        }
        .confirmationDialog("React", isPresented: reactionDialogBinding, titleVisibility: .visible) {
            ForEach(["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "✅"], id: \.self) { emoji in
                Button(emoji) { Task { await react(emoji) } }
            }
            Button("Cancel", role: .cancel) { reactionFor = nil }
        }
        .sheet(isPresented: $showMembers) {
            MembersSheet(
                roomId: roomId,
                currentUserRole: role,
                isMuted: $isMuted,
                onDismiss: { showMembers = false }
            )
            .environmentObject(session)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoSelection, matching: .images)
        .onChange(of: photoSelection) { _, item in
            guard let item else { return }
            Task { await handleImagePick(item) }
        }
        .fileImporter(
            isPresented: $fileImporterShown,
            allowedContentTypes: [.data],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                Task { await uploadFile(url, messageType: "file") }
            }
        }
    }

    // ── Top bar ─────────────────────────────────────────────────────────────

    private var topBar: some View {
        HStack {
            Button("← Back", action: onBack).buttonStyle(.bordered)
            Spacer()
            Button { Task { await startCall() } } label: {
                Image(systemName: "video.fill")
            }.buttonStyle(.borderedProminent)
            if canModerate {
                Button { Task { await toggleFreeze() } } label: {
                    Image(systemName: isFrozen ? "lock.open" : "lock")
                }.buttonStyle(.bordered)
            }
            Button { showMembers = true } label: {
                Image(systemName: "person.2")
            }.buttonStyle(.bordered)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    // ── Messages list ───────────────────────────────────────────────────────

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    ForEach(messages) { msg in
                        messageRow(msg)
                    }
                }
                .padding(12)
            }
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    @ViewBuilder
    private var replyBanner: some View {
        if let parent = replyTo {
            HStack {
                Image(systemName: "arrowshape.turn.up.left").foregroundStyle(Color.accentColor)
                VStack(alignment: .leading) {
                    Text("Replying to \(parent.senderName ?? parent.senderId)")
                        .font(.caption2.bold()).foregroundStyle(Color.accentColor)
                    Text(parent.content ?? "[media]")
                        .font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Button { replyTo = nil } label: { Image(systemName: "xmark") }
            }
            .padding(8)
            .background(Color.secondary.opacity(0.1))
        }
    }

    private var inputRow: some View {
        HStack {
            Button { showPhotoPicker = true } label: {
                Image(systemName: "photo")
            }
            Button { fileImporterShown = true } label: {
                Image(systemName: "paperclip")
            }
            TextField("Type a message", text: $input)
                .textFieldStyle(.roundedBorder)
                .onChange(of: input) { _, _ in pingTyping() }
            Button("Send") { Task { await send() } }
                .buttonStyle(.borderedProminent)
                .disabled(sending)
        }
        .padding(12)
    }

    // ── Bubble ──────────────────────────────────────────────────────────────

    @ViewBuilder
    private func messageRow(_ msg: Message) -> some View {
        let own = msg.senderId == session.userId
        let isDeleted = msg.deletedAt != nil
        let edited = (msg.updatedAt != nil) && (msg.updatedAt != msg.createdAt) && msg.createdAt != nil
        let parent: Message? = msg.metadata?.replyTo.flatMap { rid in messages.first(where: { $0.id == rid }) }
        HStack {
            if own { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 2) {
                if !own {
                    Text(msg.senderName ?? msg.senderId).font(.caption2).foregroundStyle(.secondary)
                }
                if let parent {
                    HStack(alignment: .top, spacing: 4) {
                        Rectangle().fill(Color.gray.opacity(0.4)).frame(width: 2)
                        VStack(alignment: .leading) {
                            Text("↩ \(parent.senderName ?? parent.senderId)").font(.caption2.bold())
                            Text(parent.content ?? "[media]").font(.caption2).lineLimit(1)
                        }
                    }
                    .foregroundStyle(.secondary)
                }
                bubbleBody(msg: msg, own: own, isDeleted: isDeleted)
                    .padding(8)
                    .background(own ? Color.accentColor : Color.secondary.opacity(0.2))
                    .foregroundStyle(own ? .white : .primary)
                    .cornerRadius(10)

                if let reactions = msg.reactions, !reactions.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(reactions.sorted(by: { $0.key < $1.key }), id: \.key) { emoji, userIds in
                            Text(userIds.count > 1 ? "\(emoji) \(userIds.count)" : emoji)
                                .font(.caption2)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.15))
                                .cornerRadius(8)
                        }
                    }
                }

                HStack(spacing: 6) {
                    Text(TimeUtils.formatMessageTime(msg.createdAt))
                        .font(.caption2)
                    if edited && !isDeleted {
                        Text("edited").italic().font(.caption2)
                    }
                }.foregroundStyle(.secondary)
            }
            if !own { Spacer(minLength: 40) }
        }
        .id(msg.id)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.5) {
            if !isDeleted { actionFor = msg }
        }
    }

    @ViewBuilder
    private func bubbleBody(msg: Message, own: Bool, isDeleted: Bool) -> some View {
        if isDeleted {
            Text("🗑 This message was deleted.").italic()
        } else {
            switch msg.messageType ?? "text" {
            case "image":
                Label(msg.metadata?.filename ?? "Image", systemImage: "photo")
            case "file":
                Label(msg.metadata?.filename ?? msg.content ?? "File", systemImage: "doc")
            default:
                Text(msg.content ?? "")
            }
        }
    }

    // ── Bindings for confirmationDialog/alert ──────────────────────────────

    private var actionDialogBinding: Binding<Bool> {
        Binding(get: { actionFor != nil }, set: { if !$0 { actionFor = nil } })
    }
    private var editDialogBinding: Binding<Bool> {
        Binding(get: { editFor != nil }, set: { if !$0 { editFor = nil } })
    }
    private var reactionDialogBinding: Binding<Bool> {
        Binding(get: { reactionFor != nil }, set: { if !$0 { reactionFor = nil } })
    }

    @ViewBuilder
    private var actionDialogButtons: some View {
        if let msg = actionFor {
            let isOwn = msg.senderId == session.userId
            Button("↩ Reply") { replyTo = msg; actionFor = nil }
            Button("😊 React") { reactionFor = msg; actionFor = nil }
            if isOwn {
                Button("✏ Edit") {
                    editText = msg.content ?? ""
                    editFor = msg
                    actionFor = nil
                }
                Button("🗑 Delete", role: .destructive) {
                    Task { await deleteMessage(msg) }
                    actionFor = nil
                }
            }
            Button("Cancel", role: .cancel) { actionFor = nil }
        }
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    private func bootstrap() async {
        await loadHistory()
        await refreshRole()
        await refreshMute()
        await attachRealtime()
    }

    private func loadHistory() async {
        do {
            let resp = try await UnitedChatService.getMessages(roomId: roomId, userId: session.userId)
            messages = (resp.messages ?? []).reversed()
            _ = try? await UnitedChatService.markRead(roomId: roomId, userId: session.userId)
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func refreshRole() async {
        do {
            let resp = try await UnitedChatService.getMembers(roomId: roomId)
            let me = resp.members?.first(where: { $0.userId == session.userId })
            role = me?.role ?? "member"
        } catch { /* best-effort */ }
    }

    private func refreshMute() async {
        do {
            let s = try await UnitedChatService.muteStatus(roomId: roomId, userId: session.userId)
            isMuted = s.isMuted ?? false
        } catch { /* best-effort */ }
    }

    private func attachRealtime() async {
        do {
            try await HyperBabelRealtime.shared.connect()
            unsubscribe = HyperBabelRealtime.shared.subscribeRoom(roomId) { name, raw in
                guard let envelope = raw as? [String: Any] else { return }
                switch name {
                // Workers publishes both real messages and typing pings under
                // event-name 'message' — disambiguate by the inner `type`.
                case "message":
                    let inner = envelope["type"] as? String
                    if inner == "typing" {
                        let from = (envelope["userId"] as? String) ?? ""
                        if !from.isEmpty && from != session.userId {
                            let display = (envelope["userName"] as? String) ?? from
                            typingFrom = display
                            typingClearTask?.cancel()
                            typingClearTask = Task {
                                try? await Task.sleep(nanoseconds: 3_000_000_000)
                                await MainActor.run { typingFrom = nil }
                            }
                        }
                    } else if inner == "message" {
                        guard let payload = envelope["data"] as? [String: Any],
                              let id = payload["id"] as? String,
                              !messages.contains(where: { $0.id == id }) else { return }
                        messages.append(Message(
                            id: id,
                            senderId: payload["sender_id"] as? String ?? "",
                            senderName: payload["sender_name"] as? String,
                            content: payload["content"] as? String,
                            messageType: payload["message_type"] as? String,
                            createdAt: payload["created_at"] as? String,
                            updatedAt: payload["updated_at"] as? String,
                            deletedAt: payload["deleted_at"] as? String,
                            reactions: nil,
                            metadata: nil
                        ))
                    }
                case "message.deleted":
                    let id = (envelope["id"] as? String) ?? (envelope["message_id"] as? String)
                    if let id, let idx = messages.firstIndex(where: { $0.id == id }) {
                        let m = messages[idx]
                        messages[idx] = Message(
                            id: m.id, senderId: m.senderId, senderName: m.senderName,
                            content: m.content, messageType: m.messageType,
                            createdAt: m.createdAt, updatedAt: m.updatedAt,
                            deletedAt: ISO8601DateFormatter().string(from: Date()),
                            reactions: m.reactions, metadata: m.metadata
                        )
                    }
                case "message.updated":
                    let id = (envelope["id"] as? String) ?? (envelope["message_id"] as? String)
                    let nextContent = envelope["content"] as? String
                    if let id, let nextContent, let idx = messages.firstIndex(where: { $0.id == id }) {
                        let m = messages[idx]
                        messages[idx] = Message(
                            id: m.id, senderId: m.senderId, senderName: m.senderName,
                            content: nextContent, messageType: m.messageType,
                            createdAt: m.createdAt,
                            updatedAt: ISO8601DateFormatter().string(from: Date()),
                            deletedAt: m.deletedAt,
                            reactions: m.reactions, metadata: m.metadata
                        )
                    }
                default: break
                }
            }
        } catch {
            self.error = "Realtime: \((error as? ApiError)?.errorDescription ?? error.localizedDescription)"
        }
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        sending = true
        let savedReply = replyTo
        input = ""
        replyTo = nil
        do {
            _ = try await UnitedChatService.sendMessage(
                roomId: roomId,
                body: SendMessageRequest(
                    senderId: session.userId,
                    senderName: session.displayName,
                    content: text,
                    messageType: "text"
                )
            )
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
            input = text
            replyTo = savedReply
        }
        sending = false
    }

    private func startCall() async {
        do {
            _ = try await UnitedChatService.startVideoCall(
                roomId: roomId,
                body: StartVideoCallRequest(callerId: session.userId, targetUserIds: [])
            )
            onStartCall()
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func toggleFreeze() async {
        do {
            if isFrozen { _ = try await UnitedChatService.unfreezeRoom(roomId: roomId, userId: session.userId) }
            else        { _ = try await UnitedChatService.freezeRoom(roomId: roomId, userId: session.userId) }
            isFrozen.toggle()
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func deleteMessage(_ msg: Message) async {
        do {
            _ = try await UnitedChatService.deleteMessage(roomId: roomId, messageId: msg.id, userId: session.userId)
            if let idx = messages.firstIndex(where: { $0.id == msg.id }) {
                messages[idx] = Message(
                    id: msg.id, senderId: msg.senderId, senderName: msg.senderName,
                    content: msg.content, messageType: msg.messageType,
                    createdAt: msg.createdAt, updatedAt: msg.updatedAt,
                    deletedAt: ISO8601DateFormatter().string(from: Date()),
                    reactions: msg.reactions, metadata: msg.metadata
                )
            }
        } catch { /* best-effort */ }
    }

    private func saveEdit() async {
        guard let msg = editFor else { return }
        let next = editText.trimmingCharacters(in: .whitespaces)
        editFor = nil
        guard !next.isEmpty else { return }
        do {
            _ = try await UnitedChatService.editMessage(
                roomId: roomId, messageId: msg.id, userId: session.userId, content: next
            )
            if let idx = messages.firstIndex(where: { $0.id == msg.id }) {
                messages[idx] = Message(
                    id: msg.id, senderId: msg.senderId, senderName: msg.senderName,
                    content: next, messageType: msg.messageType,
                    createdAt: msg.createdAt,
                    updatedAt: ISO8601DateFormatter().string(from: Date()),
                    deletedAt: msg.deletedAt,
                    reactions: msg.reactions, metadata: msg.metadata
                )
            }
        } catch { /* best-effort */ }
    }

    private func react(_ emoji: String) async {
        guard let msg = reactionFor else { return }
        reactionFor = nil
        do {
            // The server returns the full reaction map — apply it as-is.
            let res = try await ChatService.addReaction(
                roomId: roomId, messageId: msg.id, userId: session.userId, emoji: emoji
            )
            if let idx = messages.firstIndex(where: { $0.id == msg.id }) {
                messages[idx].reactions = res.reactions
            }
        } catch {
            // Never swallow silently — a dead-looking button is worse than a message.
            errorText = error.localizedDescription
        }
    }

    private func pingTyping() {
        let now = Date()
        if now.timeIntervalSince(lastTypingPing) < 2 { return }
        lastTypingPing = now
        Task {
            _ = try? await UnitedChatService.sendTyping(
                roomId: roomId,
                userId: session.userId,
                displayName: session.displayName
            )
        }
    }

    // ── Image / file upload ─────────────────────────────────────────────────

    private func handleImagePick(_ item: PhotosPickerItem) async {
        defer { photoSelection = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { return }
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("hb-upload-\(Int(Date().timeIntervalSince1970)).jpg")
            try data.write(to: tmp)
            await uploadFile(tmp, messageType: "image")
            try? FileManager.default.removeItem(at: tmp)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func uploadFile(_ url: URL, messageType: String) async {
        sending = true
        defer { sending = false }
        do {
            // fileImporter URLs are security-scoped; copy to a non-scoped path first.
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent(url.lastPathComponent)
            if url.startAccessingSecurityScopedResource() {
                defer { url.stopAccessingSecurityScopedResource() }
                try? FileManager.default.removeItem(at: copy)
                try FileManager.default.copyItem(at: url, to: copy)
            } else if !FileManager.default.fileExists(atPath: copy.path) {
                try? FileManager.default.removeItem(at: copy)
                try FileManager.default.copyItem(at: url, to: copy)
            }
            let mime = mimeType(for: url)
            let confirmed = try await StorageService.uploadFile(
                fileURL: copy, filename: url.lastPathComponent, mimeType: mime,
                channelId: roomId
            )
            let cdn = confirmed.url ?? confirmed.cdnUrl ?? ""
            _ = try await UnitedChatService.sendMessage(
                roomId: roomId,
                body: SendMessageRequest(
                    senderId: session.userId,
                    senderName: session.displayName,
                    content: messageType == "image" ? cdn : url.lastPathComponent,
                    messageType: messageType
                )
            )
            try? FileManager.default.removeItem(at: copy)
        } catch {
            self.error = "Upload failed: \(error.localizedDescription)"
        }
    }

    private func mimeType(for url: URL) -> String {
        if let type = UTType(filenameExtension: url.pathExtension), let mime = type.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }
}
