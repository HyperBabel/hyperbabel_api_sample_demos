/*
 * Members modal — lists every room member with role badges, plus moderation
 * actions for owner / sub_admin (promote / demote / ban) and a quick mute
 * toggle for the current user.
 */
import SwiftUI

struct MembersSheet: View {
    let roomId: String
    let currentUserRole: String
    @Binding var isMuted: Bool
    let onDismiss: () -> Void

    @EnvironmentObject var session: Session
    @State private var members: [UnitedChatService.RoomMember] = []
    @State private var loading = true
    @State private var pendingBan: UnitedChatService.RoomMember?

    private var isOwner: Bool { currentUserRole == "owner" }
    private var canModerate: Bool { isOwner || currentUserRole == "sub_admin" }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(isMuted ? "🔕 Notifications are muted for this room."
                                 : "🔔 Notifications are on.")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(isMuted ? "Unmute" : "Mute") { Task { await toggleMute() } }
                        .buttonStyle(.bordered)
                }
                Divider()
                if loading {
                    Text("Loading…").foregroundStyle(.secondary)
                } else {
                    List(members) { m in
                        memberRow(m)
                    }.listStyle(.plain)
                }
                Spacer()
            }
            .padding(16)
            .navigationTitle("Members")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done", action: onDismiss)
                }
            }
        }
        .task { await load() }
        .alert(item: $pendingBan) { m in
            Alert(
                title: Text("Ban member?"),
                message: Text("Banning \(m.userName ?? m.userId) removes them from the room and prevents them from rejoining until you unban."),
                primaryButton: .destructive(Text("Ban")) { Task { await ban(m) } },
                secondaryButton: .cancel()
            )
        }
    }

    @ViewBuilder
    private func memberRow(_ m: UnitedChatService.RoomMember) -> some View {
        let isSelf = m.userId == session.userId
        let canActOnThisRow = canModerate && !isSelf && m.role != "owner"
        HStack {
            VStack(alignment: .leading) {
                Text(m.userName ?? m.userId).fontWeight(.semibold)
                Text(m.role).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if canActOnThisRow {
                Menu {
                    if isOwner && m.role == "member" {
                        Button("🛡  Promote to sub_admin") { Task { await promote(m) } }
                    }
                    if isOwner && m.role == "sub_admin" {
                        Button("↓  Demote to member") { Task { await demote(m) } }
                    }
                    Button("🚫  Ban from room", role: .destructive) { pendingBan = m }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    private func load() async {
        loading = true
        do {
            let resp = try await UnitedChatService.getMembers(roomId: roomId)
            members = resp.members ?? []
        } catch { /* best-effort */ }
        loading = false
    }

    private func toggleMute() async {
        do {
            if isMuted {
                _ = try await UnitedChatService.unmute(roomId: roomId, userId: session.userId)
            } else {
                _ = try await UnitedChatService.mute(roomId: roomId, userId: session.userId)
            }
            isMuted.toggle()
        } catch { /* best-effort */ }
    }

    private func promote(_ m: UnitedChatService.RoomMember) async {
        do {
            _ = try await UnitedChatService.addSubAdmin(roomId: roomId, ownerId: session.userId, userId: m.userId)
            await load()
        } catch { /* best-effort */ }
    }
    private func demote(_ m: UnitedChatService.RoomMember) async {
        do {
            _ = try await UnitedChatService.removeSubAdmin(roomId: roomId, userId: m.userId, ownerId: session.userId)
            await load()
        } catch { /* best-effort */ }
    }
    private func ban(_ m: UnitedChatService.RoomMember) async {
        do {
            _ = try await UnitedChatService.ban(roomId: roomId, adminId: session.userId, userId: m.userId)
            members.removeAll { $0.userId == m.userId }
        } catch { /* best-effort */ }
    }
}

