/*
 * Home screen — list of rooms the signed-in user belongs to, with a primitive
 * "create room" form so the demo is self-contained.
 */
import SwiftUI

struct HomeScreen: View {
    let onOpenRoom: (String) -> Void
    let onLogout: () -> Void

    @EnvironmentObject var session: Session
    @State private var rooms: [Room] = []
    @State private var loading = true
    @State private var error: String = ""

    @State private var newRoomName: String = ""
    @State private var newRoomType: String = "group"

    @State private var heartbeatTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Welcome, \(session.displayName)").font(.title3).bold()
                        Text("Your rooms — pick one to enter the chat.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Logout", action: onLogout).buttonStyle(.bordered)
                }

                GroupBox("Create a room") {
                    VStack(spacing: 8) {
                        TextField("Room name", text: $newRoomName).textFieldStyle(.roundedBorder)
                        Picker("Type", selection: $newRoomType) {
                            Text("group").tag("group")
                            Text("open").tag("open")
                        }.pickerStyle(.segmented)
                        Button {
                            Task { await createRoom() }
                        } label: {
                            Text("Create").frame(maxWidth: .infinity)
                        }.buttonStyle(.borderedProminent)
                    }.padding(.top, 4)
                }

                Text("Your rooms").font(.headline)
                if loading {
                    Text("Loading…").foregroundStyle(.secondary)
                } else if !error.isEmpty {
                    Text(error).foregroundStyle(.red).font(.caption)
                } else if rooms.isEmpty {
                    Text("No rooms yet — create one above.").foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(rooms) { room in
                            Button(action: { onOpenRoom(room.id) }) {
                                roomRow(room)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .navigationTitle("Rooms")
        .task {
            await loadRooms()
            heartbeatTask = Task {
                while !Task.isCancelled {
                    do { _ = try await PresenceService.heartbeat(userId: session.userId) } catch {}
                    try? await Task.sleep(nanoseconds: 30_000_000_000)
                }
            }
        }
        .onDisappear { heartbeatTask?.cancel() }
    }

    @ViewBuilder
    private func roomRow(_ room: Room) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(room.roomName ?? room.id).fontWeight(.semibold)
                Text("\(room.roomType) · \(room.memberCount.map(String.init) ?? "—") members")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(10)
    }

    private func loadRooms() async {
        loading = true
        error = ""
        do {
            let resp = try await UnitedChatService.listRooms(userId: session.userId)
            rooms = resp.rooms ?? resp.memberRooms ?? []
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
        loading = false
    }

    private func createRoom() async {
        let name = newRoomName.trimmingCharacters(in: .whitespaces)
        if name.isEmpty { return }
        do {
            _ = try await UnitedChatService.createRoom(
                CreateRoomRequest(
                    roomType: newRoomType,
                    creatorId: session.userId,
                    roomName: name,
                    members: [session.userId]
                )
            )
            newRoomName = ""
            await loadRooms()
        } catch {
            self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription
        }
    }
}
