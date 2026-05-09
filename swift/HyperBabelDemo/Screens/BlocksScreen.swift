/*
 * Block management — global block list with search + simple pagination.
 * Mirrors the React / Flutter / Kotlin equivalents.
 */
import SwiftUI

struct BlocksScreen: View {
    let onBack: () -> Void
    @EnvironmentObject var session: Session
    @State private var rows: [BlockedUser] = []
    @State private var query: String = ""
    @State private var loading = true
    @State private var error: String = ""
    @State private var page: Int = 0
    private let pageSize = 10

    var filtered: [BlockedUser] {
        guard !query.isEmpty else { return rows }
        return rows.filter { $0.blockedId.localizedCaseInsensitiveContains(query) }
    }

    var totalPages: Int { max(1, Int(ceil(Double(filtered.count) / Double(pageSize)))) }
    var slice: ArraySlice<BlockedUser> {
        let start = page * pageSize
        return filtered.dropFirst(start).prefix(pageSize)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("← Back", action: onBack).buttonStyle(.bordered)
                Text("Blocked Users").font(.title3).bold()
            }
            TextField("Search by user ID…", text: $query)
                .textFieldStyle(.roundedBorder)
                .onChange(of: query) { _, _ in page = 0 }
            Text("⚠️ Blocks apply to every room, not just one.")
                .font(.caption2).foregroundStyle(.secondary)

            if loading {
                Text("Loading…").foregroundStyle(.secondary)
            } else if !error.isEmpty {
                Text(error).foregroundStyle(.red)
            } else if filtered.isEmpty {
                Text(query.isEmpty ? "You haven’t blocked anyone yet." : "No matches.")
                    .foregroundStyle(.secondary)
            } else {
                List(Array(slice)) { row in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(row.blockedId).font(.subheadline).bold()
                            if let at = row.createdAt {
                                Text("Blocked at: \(at)").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button(role: .destructive, action: { unblock(row) }) {
                            Text("Unblock")
                        }.buttonStyle(.borderedProminent)
                    }
                }.listStyle(.plain)

                if totalPages > 1 {
                    HStack {
                        Button("← Prev") { page = max(0, page - 1) }.disabled(page == 0)
                        Spacer()
                        Text("\(page + 1) / \(totalPages)").foregroundStyle(.secondary)
                        Spacer()
                        Button("Next →") { page = min(totalPages - 1, page + 1) }
                            .disabled(page >= totalPages - 1)
                    }
                }
            }
            Spacer()
        }
        .padding(16)
        .navigationBarBackButtonHidden(true)
        .task { await load() }
    }

    private func load() async {
        loading = true
        error = ""
        do {
            let resp = try await UsersService.getBlockList(userId: session.userId)
            rows = resp.blockedUsers ?? []
        } catch { self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription }
        loading = false
    }

    private func unblock(_ row: BlockedUser) {
        Task {
            do {
                _ = try await UsersService.unblock(blockerId: session.userId, blockedId: row.blockedId)
                rows.removeAll { $0.blockedId == row.blockedId }
            } catch { self.error = (error as? ApiError)?.errorDescription ?? error.localizedDescription }
        }
    }
}
