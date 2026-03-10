#pragma once

#include <cstddef>
#include <cstdint>

/*
Minecraft for Windows 1.21.130 ClientInstance dump

Built from:
  - live IDA analysis of Minecraft.Windows.exe
  - live Cheat Engine MCP validation in-world
  - live ReClass MCP classes created against the running game
  - revalidated after the new ReClassMcpBootstrap runtime reconnect on 2026-03-10
  - Flarial only as a historical anchor, not as ground truth

What is confirmed on this build:
  - concrete ClientInstance object size: 0xC20
  - shared wrapper sits 0x10 bytes before the concrete object
  - world render owner + 0x390 -> ClientInstance is live and stable in-world
  - *(client + 0x90) == client
  - *(client + 0x98) == client - 0x10
  - *(client + 0x1B8) == worldRenderThis

What is not confirmed:
  - old public Flarial field names past the few partially-aligned slots
  - packetSender/guiData names from older public packs

Live snapshot from this session:
  worldRenderThis   = 0x000001E52A2EDAF0
  clientInstance    = 0x000001E51B1A2820
  sharedWrapperBase = 0x000001E51B1A2810

ReClass classes created live in the current project:
  - ClientInstance_1_21_130_head          @ 0x1E51B1A2820
  - ClientInstance_1_21_130_links_90      @ 0x1E51B1A28B0
  - ClientInstance_1_21_130_ptr_block_168 @ 0x1E51B1A2988
  - WorldRenderOwner_1_21_130_client_slot @ 0x1E52A2EDE78
*/

namespace mc_1_21_130::sig {

inline constexpr std::ptrdiff_t kWorldRenderOwnerRva = 0x1985320;
inline constexpr const char* kWorldRenderOwnerSig =
    "48 8B C4 48 89 58 20 55 56 57 41 54 41 55 41 56 41 57 "
    "48 8D A8 ?? ?? ?? ?? 48 81 EC ?? ?? ?? ?? 0F 29 70 ?? "
    "0F 29 78 ?? 44 0F 29 40 ??";

inline constexpr std::ptrdiff_t kCreateClientInstanceRva = 0x0A1D430;
inline constexpr const char* kCreateClientInstanceSig =
    "48 89 5C 24 10 48 89 6C 24 18 48 89 74 24 20 48 89 4C 24 08 "
    "57 48 83 EC 40 48 8B EA 48 8B F9 33 F6 48 8B 0D ?? ?? ?? ?? "
    "48 8B 01 BA 20 0C 00 00";

inline constexpr std::ptrdiff_t kClientInstanceCtorRva = 0x0C02F50;
inline constexpr const char* kClientInstanceCtorSig =
    "48 89 5C 24 18 55 56 57 41 54 41 55 41 56 41 57 "
    "48 8D AC 24 ?? ?? ?? ?? 48 81 EC 50 05 00 00 "
    "48 8B 05 ?? ?? ?? ?? 48 33 C4 48 89 85 48 04 00 00";

inline constexpr std::ptrdiff_t kClientInstanceDtorRva = 0x0C04B60;
inline constexpr const char* kClientInstanceDtorSig =
    "48 89 5C 24 10 48 89 6C 24 18 56 57 41 54 41 56 41 57 "
    "48 81 EC B0 00 00 00 48 8B 05 ?? ?? ?? ?? 48 33 C4 "
    "48 89 84 24 A8 00 00 00";

} // namespace mc_1_21_130::sig

namespace mc_1_21_130::snapshot {

inline constexpr std::uintptr_t kWorldRenderThis = 0x000001E52A2EDAF0ull;
inline constexpr std::uintptr_t kClientInstance = 0x000001E51B1A2820ull;
inline constexpr std::uintptr_t kSharedWrapperBase = 0x000001E51B1A2810ull;

inline constexpr std::uintptr_t kRuntimeClientInstanceVftable = 0x00007FF6F4C7FC58ull;
inline constexpr std::uintptr_t kRuntimeSecondaryVftable = 0x00007FF6F4C7FC30ull;

} // namespace mc_1_21_130::snapshot

namespace mc_1_21_130::muirc {

// Historical UI-side path. Keep for UI hook work only.
inline constexpr std::ptrdiff_t kClientInstance = 0x8;
inline constexpr std::ptrdiff_t kScreenContext = 0x10;
inline constexpr std::ptrdiff_t kTextures = 0x48;

} // namespace mc_1_21_130::muirc

namespace mc_1_21_130::client_instance {

struct NamedOffset {
    std::ptrdiff_t offset;
    const char* name;
    const char* note;
};

struct LiveQword {
    std::ptrdiff_t offset;
    std::uint64_t value;
};

struct LiveAscii {
    std::ptrdiff_t offset;
    std::size_t length;
    const char* text;
    const char* note;
};

inline constexpr std::size_t kConcreteSize = 0xC20;
inline constexpr std::size_t kSharedWrapperHeaderSize = 0x10;

inline constexpr std::ptrdiff_t kSelf = 0x90;
inline constexpr std::ptrdiff_t kSharedWrapper = 0x98;
inline constexpr std::ptrdiff_t kWorldRenderBacklink = 0x1B8;
inline constexpr std::ptrdiff_t kWorldRenderToClientInstance = 0x390;

// These line up with old public packs, but only as candidates on 1.21.130.
inline constexpr std::ptrdiff_t kMinecraftGameCandidate = 0xD0;
inline constexpr std::ptrdiff_t kLevelRendererCandidate = 0xE8;
inline constexpr std::ptrdiff_t kGuiDataCandidate = 0x590;

inline constexpr const char* kReClassHeadClass = "ClientInstance_1_21_130_head";
inline constexpr const char* kReClassLinksClass = "ClientInstance_1_21_130_links_90";
inline constexpr const char* kReClassPtrBlockClass = "ClientInstance_1_21_130_ptr_block_168";
inline constexpr const char* kReClassWorldRenderClass = "WorldRenderOwner_1_21_130_client_slot";

inline constexpr NamedOffset kConfirmedFields[] = {
    {0x000, "vfptr", "Runtime vftable = 0x7FF6F4C7FC58, IDA off_14845FC58"},
    {0x090, "self", "Verified live: *(client + 0x90) == client"},
    {0x098, "sharedWrapper", "Verified live: *(client + 0x98) == client - 0x10"},
    {0x0D0, "minecraftGame_candidate", "Still aligns with the old public minecraftGame slot"},
    {0x0E8, "levelRenderer_candidate", "Still aligns with the old public levelRenderer slot"},
    {0x1B8, "worldRenderThis_backlink", "Verified live: *(client + 0x1B8) == worldRenderThis"},
    {0x590, "guiData_candidate", "Looks like a real heap pointer on this build"},
    {0x6D0, "inline_ascii_127_0_0_1", "Inline ASCII span"},
    {0xA28, "self_mirror_candidate", "Second self-like pointer in the late object body"},
    {0xA90, "inline_ascii_k0nstnt1713", "Inline ASCII span"},
    {0xAB0, "inline_ascii_world_name", "Inline ASCII span, current world name"},
};

// Live non-zero qwords for the head of the object.
inline constexpr LiveQword kHeadSnapshot[] = {
    {0x000, 0x00007FF6F4C7FC58ull},
    {0x008, 0x000001E51AD04D60ull},
    {0x010, 0x000001E51AD04D50ull},
    {0x018, 0x00007FF6F4C7FC30ull},
    {0x020, 0x000001E53E3EB720ull},
    {0x028, 0x000001E53E3EB710ull},
    {0x030, 0x0000000000000002ull},
    {0x078, 0x00000000FFFFFFFFull},
    {0x080, 0x00007FF6F4C809C0ull},
    {0x088, 0x00007FF6F4C809A0ull},
    {0x090, 0x000001E51B1A2820ull},
    {0x098, 0x000001E51B1A2810ull},
    {0x0A0, 0x0000000000000003ull},
    {0x0A8, 0x00007FF6F4C6F858ull},
    {0x0B0, 0x000001E51AD05010ull},
    {0x0B8, 0x0000000000000001ull},
    {0x0C0, 0x00007FF6EF858CE0ull},
    {0x0C8, 0x00007FF6EF858F60ull},
    {0x0D0, 0x00007FF6EE0981A0ull},
    {0x0D8, 0x00007FF6EFF6F3D0ull},
    {0x0E0, 0x00000000439C28FDull},
    {0x0E8, 0x00007FF6F4C6F840ull},
    {0x0F0, 0x000001E51AD04DF0ull},
    {0x0F8, 0x00000000FAC46DF3ull},
};

// Dense pointer block that is worth keeping open in ReClass.
inline constexpr LiveQword kPtrBlock168Snapshot[] = {
    {0x168, 0x000001E53F8845C0ull},
    {0x170, 0x000001E53F8845B0ull},
    {0x178, 0x000001E53C89C050ull},
    {0x180, 0x000001E53F86FE98ull},
    {0x188, 0x000001E5077F6010ull},
    {0x190, 0x000001E5077F6000ull},
    {0x198, 0x000001E507257C98ull},
    {0x1A0, 0x000001E53F86FDE0ull},
    {0x1A8, 0x000001E507F17440ull},
    {0x1B0, 0x0000000000000001ull},
    {0x1B8, 0x000001E52A2EDAF0ull},
    {0x1C0, 0x000001E58074E050ull},
    {0x1C8, 0x000001E51AEFAFE0ull},
};

// Notable late-body snapshot values.
inline constexpr LiveQword kLateSnapshot[] = {
    {0x590, 0x000001E51B237000ull},
    {0x6D0, 0x2E302E302E373231ull},
    {0x6D8, 0x0000000000000031ull},
    {0x750, 0x000001E5870DD030ull},
    {0x758, 0x0000000069B08600ull},
    {0x778, 0x000001E597FA3B40ull},
    {0x788, 0x000001E582C40880ull},
    {0x790, 0x000001E582C40900ull},
    {0x798, 0x000001E582C40900ull},
    {0x8C8, 0x000001E51AD04D10ull},
    {0x8F0, 0x000001E51AD04D90ull},
    {0x918, 0x000001E504B96CC0ull},
    {0x920, 0x000001E504B96CB0ull},
    {0x958, 0x00007FF6EF858CE0ull},
    {0x960, 0x000001E51B1A3148ull},
    {0x968, 0x000001E51B0D4040ull},
    {0x970, 0x000001E51AEF90D0ull},
    {0x978, 0x000001E51AEFAC60ull},
    {0x980, 0x000001E51AEFAE90ull},
    {0x988, 0x000001E507EFD2A0ull},
    {0x990, 0x000001E51AEFB980ull},
    {0x9A0, 0x000001E53E3EB720ull},
    {0x9A8, 0x000001E53E3EB710ull},
    {0x9D0, 0x000001E5825AEBC0ull},
    {0x9D8, 0x000001E53F884800ull},
    {0x9E0, 0x000001E53F8847F0ull},
    {0x9E8, 0x000001E53F7DD990ull},
    {0x9F8, 0x000001E507EFCF90ull},
    {0xA00, 0x000001E507EFCF80ull},
    {0xA08, 0x000001E51B0ED9A0ull},
    {0xA10, 0x000001E51B212F60ull},
    {0xA18, 0x000001E51B20C7F0ull},
    {0xA20, 0x00007FF6F4C868E0ull},
    {0xA28, 0x000001E51B1A2820ull},
    {0xA30, 0x000001E53C89C050ull},
    {0xA38, 0x000001E50744EB60ull},
    {0xA40, 0x000001E50744EB50ull},
    {0xA48, 0x000001E51AEFAF10ull},
    {0xA50, 0x000001E51AEFAF00ull},
    {0xA58, 0x000001E554E206F0ull},
    {0xA60, 0x000001E5794CE550ull},
    {0xA90, 0x31746E74736E306Bull},
    {0xA98, 0x0000000000333137ull},
    {0xAB0, 0x646C726F5720794Dull},
    {0xAF0, 0x000001E507EFC950ull},
    {0xAF8, 0x000001E507EFC940ull},
    {0xB18, 0x000001E507F0B320ull},
    {0xB20, 0x000001E507F0B310ull},
    {0xB28, 0x000001E507EE4DE0ull},
    {0xB30, 0x000001E53F883D80ull},
    {0xB38, 0x000001E53F883D70ull},
    {0xB40, 0x000001E53F870780ull},
    {0xB58, 0x000001E507EFC810ull},
    {0xB60, 0x000001E507EFC800ull},
    {0xBB8, 0x000001E51AEDAB30ull},
    {0xBC0, 0x000001E51AEDAB20ull},
    {0xBC8, 0x000001E51AD2E5D0ull},
    {0xBD0, 0x000001E51AD2E5C0ull},
    {0xBD8, 0x000001E51B20BE40ull},
    {0xBE0, 0x000001E53F883F00ull},
    {0xBE8, 0x000001E53F883EF0ull},
    {0xBF0, 0x00007FF6F5C08B00ull},
    {0xC00, 0x000001E5B957D490ull},
    {0xC08, 0x000001E5B957D480ull},
    {0xC10, 0x0000000000000001ull},
    {0xC18, 0x105111B2923988CDull},
};

inline constexpr LiveAscii kInlineAscii[] = {
    {0x6D0, 9, "127.0.0.1", "inline text span"},
    {0xA90, 11, "k0nstnt1713", "inline text span"},
    {0xAB0, 8, "My World", "inline text span"},
};

inline constexpr std::uintptr_t field_address(std::uintptr_t client, std::ptrdiff_t offset) {
    return client + static_cast<std::uintptr_t>(offset);
}

inline std::uintptr_t qword_at(std::uintptr_t base, std::ptrdiff_t offset) {
    return *reinterpret_cast<std::uintptr_t*>(base + static_cast<std::uintptr_t>(offset));
}

inline std::uintptr_t from_world_render_this(std::uintptr_t worldRenderThis) {
    return qword_at(worldRenderThis, kWorldRenderToClientInstance);
}

inline std::uintptr_t from_muirc(std::uintptr_t minecraftUIRenderContext) {
    return qword_at(minecraftUIRenderContext, muirc::kClientInstance);
}

inline bool self_ok(std::uintptr_t client) {
    return qword_at(client, kSelf) == client;
}

inline bool shared_wrapper_ok(std::uintptr_t client) {
    return qword_at(client, kSharedWrapper) == (client - kSharedWrapperHeaderSize);
}

inline bool world_render_backlink_ok(std::uintptr_t client, std::uintptr_t worldRenderThis) {
    return qword_at(client, kWorldRenderBacklink) == worldRenderThis;
}

inline bool looks_like_client_instance(std::uintptr_t client, std::uintptr_t worldRenderThis) {
    return client != 0 &&
           self_ok(client) &&
           shared_wrapper_ok(client) &&
           world_render_backlink_ok(client, worldRenderThis);
}

/*
How to reacquire ClientInstance on 1.21.130:

1. Break or hook at Minecraft.Windows.exe + 0x1985320.
2. Capture RCX at function entry. That is the current worldRenderThis.
3. Read *(uintptr_t*)(RCX + 0x390).
4. Validate:
     - *(client + 0x90) == client
     - *(client + 0x98) == client - 0x10
     - *(client + 0x1B8) == worldRenderThis

How to use the ReClass classes created in this session:

1. Open ClientInstance_1_21_130_head for the front 0x100 bytes.
2. Open ClientInstance_1_21_130_links_90 for the verified self/sharedWrapper pair.
3. Open ClientInstance_1_21_130_ptr_block_168 for the dense pointer region.
4. Open WorldRenderOwner_1_21_130_client_slot to watch 0x388 / 0x390 / 0x398 live.

Important:
  - Old Flarial public packs are stale on this build.
  - The 0xD0 / 0xE8 slots still look structurally useful.
  - The world-render path is the clean anchor. Start there, then rename later fields from live use.
*/

} // namespace mc_1_21_130::client_instance
