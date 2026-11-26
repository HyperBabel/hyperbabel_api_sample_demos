/*
 * Chat screen — full HyperBabel chat surface with:
 *   - Real-time message, typing, edit, delete and reaction events
 *   - Edit / delete on own messages, Reply / React on any
 *   - Image and arbitrary-file upload via the 3-step presign flow, sent as an
 *     image / video / audio / file message that carries the file URL
 *   - Members modal with promote / demote / ban + room mute toggle
 *   - Freeze toggle for owner / sub_admin; the frozen state is read from the
 *     room and kept current by the room's `room.updated` event
 *   - Video-call button (hidden in `open` rooms — calls are not available there)
 *   - Locale-aware timestamps + edited indicator
 *   - Video-call events shown as one-line notices
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
    /// Room member ids — a group-room call has to name who to ring.
    @State private var memberIds: [String] = []
    @State private var isFrozen = false
    /// False until the room is loaded, and for `open` rooms.
    @State private var canCall = false
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
        .onChange(of: photoSelection) { item in
            guard let item else { return }
            Task { await handleImagePick(item) }
        }
        .fileImporter(
            isPresented: $fileImporterShown,
            allowedContentTypes: [.data],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                // "file" is only the fallback: the server derives image /
                // video / audio / file from the name and confirm returns it.
                Task { await uploadFile(url, messageType: "file") }
            }
        }
    }

    // ── Top bar ─────────────────────────────────────────────────────────────

    private var topBar: some View {
        HStack {
            Button("← Back", action: onBack).buttonStyle(.bordered)
            Spacer()
            if canCall {
                Button { Task { await startCall() } } label: {
                    Image(systemName: "video.fill")
                }.buttonStyle(.borderedProminent)
            }
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
                        if msg.messageType == "video_call" {
                            callNotice(msg)
                        } else {
                            messageRow(msg)
                        }
                    }
                }
                .padding(12)
            }
            .onChange(of: messages.count) { _ in
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
                    Text(previewText(parent))
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
                .onChange(of: input) { _ in pingTyping() }
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
        let edited = msg.editedAt != nil
        // Replies are linked by the top-level `reply_to`; `metadata.reply_to`
        // is only a fallback for clients that put it there.
        let parentId = msg.replyTo ?? msg.metadata?.replyTo
        let parent: Message? = parentId.flatMap { rid in messages.first(where: { $0.id == rid }) }
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
                            Text(previewText(parent)).font(.caption2).lineLimit(1)
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

    /// `video_call` system messages have empty content; the call event is in
    /// `metadata.event`. Shown as a one-line notice, never as a bubble.
    private func callNotice(_ msg: Message) -> some View {
        let text: String
        switch msg.metadata?.event {
        case "call_started":  text = "Video call started"
        case "call_accepted": text = "Call answered"
        case "call_ended":    text = "Video call ended"
        case "call_rejected": text = "Call declined"
        case "call_missed":   text = "Missed call"
        case "call_busy":     text = "Busy"
        default:              text = "Video call"
        }
        let time = TimeUtils.formatMessageTime(msg.createdAt)
        return Text(time.isEmpty ? text : "\(text) · \(time)")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
            .id(msg.id)
    }

    @ViewBuilder
    private func bubbleBody(msg: Message, own: Bool, isDeleted: Bool) -> some View {
        if isDeleted {
            Text("🗑 This message was deleted.").italic()
        } else {
            switch msg.messageType ?? "text" {
            case "image":
                if let url = attachmentURL(msg) {
                    Link(destination: url) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Label(msg.metadata?.filename ?? "Image", systemImage: "photo")
                        }
                        .frame(maxWidth: 220, maxHeight: 220)
                    }
                } else {
                    Label(msg.metadata?.filename ?? "Image", systemImage: "photo")
                }
            case "video", "audio", "file":
                let icon = msg.messageType == "video" ? "film"
                    : msg.messageType == "audio" ? "waveform" : "doc"
                let label = Label(attachmentName(msg), systemImage: icon)
                if let url = attachmentURL(msg) {
                    Link(destination: url) { label.underline() }
                } else {
                    label
                }
            default:
                Text(msg.content ?? "")
            }
        }
    }

    /// Attachments carry the file URL as `metadata.url` and as `content`.
    private func attachmentURL(_ msg: Message) -> URL? {
        let raw = msg.metadata?.url ?? msg.content ?? ""
        guard raw.hasPrefix("https://") || raw.hasPrefix("http://") else { return nil }
        return URL(string: raw)
    }

    private func attachmentName(_ msg: Message) -> String {
        if let name = msg.metadata?.filename, !name.isEmpty { return name }
        switch msg.messageType {
        case "video": return "Video"
        case "audio": return "Audio"
        default:      return "File"
        }
    }

    /// One-line preview used by reply quotes — never the raw file URL.
    private func previewText(_ msg: Message) -> String {
        switch msg.messageType ?? "text" {
        case "image": return "🖼 \(msg.metadata?.filename ?? "Image")"
        case "video": return "🎬 \(attachmentName(msg))"
        case "audio": return "🎵 \(attachmentName(msg))"
        case "file":  return "📎 \(attachmentName(msg))"
        default:      return msg.content ?? ""
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
            let members = resp.members ?? []
            memberIds = members.map(\.userId)
            role = members.first(where: { $0.userId == session.userId })?.role ?? "member"
        } catch { /* best-effort */ }
    }

    /// A message can arrive twice — in the send response and as the
    /// real-time echo of the same send — so each id is added once.
    private func appendIfNew(_ m: Message) {
        if !messages.contains(where: { $0.id == m.id }) { messages.append(m) }
    }

    private func refreshMute() async {
        do {
            let s = try await UnitedChatService.muteStatus(roomId: roomId, userId: session.userId)
            isMuted = s.isMuted ?? false
        } catch { /* best-effort */ }
    }

    private func attachRealtime() async {
        do {
            // The channel name comes from the API and is used verbatim — it
            // cannot be rebuilt from the room id (see subscribeRoom's doc).
            let res = try await UnitedChatService.getRoom(roomId: roomId, userId: session.userId)
            isFrozen = res.room.isFrozen ?? false
            canCall = res.room.allowsVideoCall
            guard let realtimeChannel = res.room.realtimeChannel, !realtimeChannel.isEmpty else { return }

            try await HyperBabelRealtime.shared.connect()
            unsubscribe = HyperBabelRealtime.shared.subscribeRoom(realtimeChannel) { name, raw in
                guard let envelope = raw as? [String: Any] else { return }
                switch name {
                // The server publishes both real messages and typing pings
                // under event-name 'message' — disambiguate by the inner `type`.
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
                              let id = payload["id"] as? String else { return }
                        // Live captions also arrive here, but the message list
                        // never returns them — showing them would make lines
                        // that vanish on the next load.
                        if (payload["message_type"] as? String) == "caption" { return }
                        appendIfNew(Message(
                            id: id,
                            senderId: payload["sender_id"] as? String ?? "",
                            senderName: payload["sender_name"] as? String,
                            content: payload["content"] as? String,
                            messageType: payload["message_type"] as? String,
                            createdAt: payload["created_at"] as? String,
                            editedAt: payload["edited_at"] as? String,
                            deletedAt: payload["deleted_at"] as? String,
                            reactions: nil,
                            metadata: MessageMetadata(json: payload["metadata"]),
                            replyTo: payload["reply_to"] as? String
                        ))
                    }
                // Delete and edit events carry the message id INSIDE `data`:
                //   message.deleted → { type, timestamp, data: { message_id, deleted_by } }
                //   message.updated → { type, timestamp, data: { message_id, content, edited_at } }
                case "message.deleted":
                    let data = envelope["data"] as? [String: Any]
                    if let id = data?["message_id"] as? String,
                       let idx = messages.firstIndex(where: { $0.id == id }) {
                        messages[idx].deletedAt = ISO8601DateFormatter().string(from: Date())
                    }
                case "message.updated":
                    let data = envelope["data"] as? [String: Any]
                    if let id = data?["message_id"] as? String,
                       let nextContent = data?["content"] as? String,
                       let idx = messages.firstIndex(where: { $0.id == id }) {
                        messages[idx].content = nextContent
                        messages[idx].editedAt = (data?["edited_at"] as? String)
                            ?? ISO8601DateFormatter().string(from: Date())
                    }
                // reaction → { type, timestamp, data: { message_id, emoji, user_id, action: "add" | "remove" } }
                // Applied idempotently: your own reaction also comes back here.
                case "reaction":
                    let data = envelope["data"] as? [String: Any]
                    if let id = data?["message_id"] as? String,
                       let emoji = data?["emoji"] as? String,
                       let user = data?["user_id"] as? String,
                       let idx = messages.firstIndex(where: { $0.id == id }) {
                        applyReaction(at: idx, emoji: emoji, userId: user,
                                      added: (data?["action"] as? String) != "remove")
                    }
                // room.updated → { type, timestamp, data: { channel_id, is_frozen, actor_user_id } }
                case "room.updated":
                    let data = envelope["data"] as? [String: Any]
                    if let frozen = data?["is_frozen"] as? Bool { isFrozen = frozen }
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
            let sent = try await UnitedChatService.sendMessage(
                roomId: roomId,
                body: SendMessageRequest(
                    senderId: session.userId,
                    senderName: session.displayName,
                    content: text,
                    messageType: "text",
                    replyTo: savedReply?.id
                )
            )
            appendIfNew(sent)
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
            input = text
            replyTo = savedReply
        }
        sending = false
    }

    private func startCall() async {
        // A group room must name who to ring (`target_user_ids`, 400 when it
        // is empty); a 1:1 room rings the other member and ignores the list.
        // This demo's call screen is 1:1 (see VideoQuality.swift), so it rings
        // one other member. Room calls allow up to 3 people (caller + 2) on a
        // plan with group video and 2 otherwise — more answers 400
        // `plan_upgrade_required` (`limit_exceeded` above 3). A call nobody
        // answers is closed by the server after 3 minutes.
        let targets = Array(memberIds.filter { $0 != session.userId }.prefix(1))
        do {
            _ = try await UnitedChatService.startVideoCall(
                roomId: roomId,
                body: StartVideoCallRequest(callerId: session.userId, targetUserIds: targets)
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
                messages[idx].deletedAt = ISO8601DateFormatter().string(from: Date())
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
                messages[idx].content = next
                messages[idx].editedAt = ISO8601DateFormatter().string(from: Date())
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
            self.error = error.localizedDescription
        }
    }

    /// Apply one live reaction change to the emoji → user ids map.
    private func applyReaction(at idx: Int, emoji: String, userId: String, added: Bool) {
        var map = messages[idx].reactions ?? [:]
        var users = map[emoji] ?? []
        if added {
            if !users.contains(userId) { users.append(userId) }
        } else {
            users.removeAll { $0 == userId }
        }
        map[emoji] = users.isEmpty ? nil : users
        messages[idx].reactions = map
    }

    private func pingTyping() {
        let now = Date()
        // Typing calls count against the same per-minute rate limit as every
        // other call (sending included), so send at most one every 3 s.
        if now.timeIntervalSince(lastTypingPing) < 3 { return }
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
            let filename = url.lastPathComponent
            let confirmed = try await StorageService.uploadFile(
                fileURL: copy, filename: filename, mimeType: mime,
                channelId: roomId
            )
            guard let fileUrl = confirmed.url ?? confirmed.cdnUrl, !fileUrl.isEmpty else {
                throw ApiError.http(status: -1, message: "The server did not return a file URL")
            }
            // Send as the type the server derived for this file —
            // "image" | "video" | "audio" | "file", all accepted by the send
            // endpoint. The URL goes in `content` and `metadata.url` so every
            // client can open the attachment.
            let sent = try await UnitedChatService.sendMessage(
                roomId: roomId,
                body: SendMessageRequest(
                    senderId: session.userId,
                    senderName: session.displayName,
                    content: fileUrl,
                    messageType: confirmed.messageType ?? messageType,
                    metadata: AttachmentMetadata(
                        url: fileUrl,
                        filename: filename,
                        mimeType: confirmed.mimeType ?? mime,
                        sizeBytes: confirmed.sizeBytes
                    )
                )
            )
            appendIfNew(sent)
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
