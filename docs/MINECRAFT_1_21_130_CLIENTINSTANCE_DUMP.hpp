#pragma once

#include <cstddef>
#include <cstdint>

/*
Minecraft for Windows 1.21.130
ClientInstance layout and live recovery notes

This file replaces the older offset-pack dump with a structure-first layout.
It is built from:
  - live IDA analysis of Minecraft.Windows.exe
  - live Cheat Engine MCP tracing while in-world
  - live ReClass MCP validation against the running process

Confirmed corrections vs. the older dump:
  - ClientInstance::create allocates 0xC20 bytes TOTAL, not 0xC20 bytes of
    concrete ClientInstance body.
  - The concrete ClientInstance body starts at wrapper + 0x10 and is 0xC10 bytes.
  - client + 0x590 and client + 0x5B0 are tree/sentinel roots on this build,
    not guiData.
  - The modern stable live chain is:
      render-entry RCX = worldRenderThis
      ClientInstance* = *(worldRenderThis + 0x390)

Current session snapshot:
  module base              = 0x00007FF61CEB0000
  render entry             = 0x00007FF61E835320 (Minecraft.Windows.exe + 0x1985320)
  worldRenderThis          = 0x000002CCD4932040
  worldRenderThis+0x390    = 0x000002CCD49323D0
  ClientInstance*          = 0x000002CCCE90A740
  SharedWrapperHeader*     = 0x000002CCCE90A730

Quick recovery instructions:
  1. Break on execute at Minecraft.Windows.exe + 0x1985320.
  2. At function entry, capture RCX as worldRenderThis.
  3. Read [RCX + 0x390] as ClientInstance*.
  4. Validate:
       *(client + 0x90) == client
       *(client + 0x98) == client - 0x10
       *(client + 0x1B8) == worldRenderThis
*/

namespace mc_1_21_130::client_instance {

namespace sig {

inline constexpr std::ptrdiff_t kRenderEntryRva = 0x1985320;
inline constexpr const char* kRenderEntrySig =
    "48 8B C4 48 89 58 20 55 56 57 41 54 41 55 41 56 41 57 "
    "48 8D A8 ?? ?? ?? ?? 48 81 EC ?? ?? ?? ?? 0F 29 70 ?? "
    "0F 29 78 ?? 44 0F 29 40 ??";

inline constexpr std::ptrdiff_t kCreateRva = 0x0A1D430;
inline constexpr const char* kCreateSig =
    "48 89 5C 24 10 48 89 6C 24 18 48 89 74 24 20 48 89 4C 24 08 "
    "57 48 83 EC 40 48 8B EA 48 8B F9 33 F6 48 8B 0D ?? ?? ?? ?? "
    "48 8B 01 BA 20 0C 00 00";

inline constexpr std::ptrdiff_t kCtorRva = 0x0C02F50;
inline constexpr const char* kCtorSig =
    "48 89 5C 24 18 55 56 57 41 54 41 55 41 56 41 57 "
    "48 8D AC 24 ?? ?? ?? ?? 48 81 EC 50 05 00 00 "
    "48 8B 05 ?? ?? ?? ?? 48 33 C4 48 89 85 48 04 00 00";

inline constexpr std::ptrdiff_t kDtorRva = 0x0C04B60;
inline constexpr const char* kDtorSig =
    "48 89 5C 24 10 48 89 6C 24 18 56 57 41 54 41 56 41 57 "
    "48 81 EC B0 00 00 00 48 8B 05 ?? ?? ?? ?? 48 33 C4 "
    "48 89 84 24 A8 00 00 00";

} // namespace sig

namespace live {

inline constexpr std::uintptr_t kModuleBase = 0x00007FF61CEB0000ull;
inline constexpr std::uintptr_t kRenderEntry = 0x00007FF61E835320ull;

inline constexpr std::uintptr_t kWorldRenderThis = 0x000002CCD4932040ull;
inline constexpr std::uintptr_t kWorldRenderClientSlot = 0x000002CCD49323D0ull;

inline constexpr std::uintptr_t kClientInstance = 0x000002CCCE90A740ull;
inline constexpr std::uintptr_t kSharedWrapper = 0x000002CCCE90A730ull;

inline constexpr std::uintptr_t kClientVftable = 0x00007FF62530FC58ull;
inline constexpr std::uintptr_t kClientSecondaryVftable = 0x00007FF62530FC30ull;
inline constexpr std::uintptr_t kWrapperVftable = 0x00007FF625303470ull;

inline constexpr std::ptrdiff_t kWorldRenderToClientOffset = 0x390;
inline constexpr std::size_t kWrapperSize = 0x10;
inline constexpr std::size_t kConcreteSize = 0xC10;
inline constexpr std::size_t kAllocationSize = 0xC20;

inline constexpr std::ptrdiff_t kClientVftableRva = 0x845FC58;
inline constexpr std::ptrdiff_t kClientSecondaryVftableRva = 0x845FC30;
inline constexpr std::ptrdiff_t kWrapperVftableRva = 0x8453470;

} // namespace live

struct SharedWrapperHeader {
    std::uintptr_t vfptr_wrapper;
    std::int32_t strong_refcount;
    std::int32_t weak_refcount;
};
static_assert(sizeof(SharedWrapperHeader) == 0x10);

struct SharedHandle {
    std::uintptr_t value;
    std::uintptr_t control;
    std::uintptr_t owner;
};
static_assert(sizeof(SharedHandle) == 0x18);

struct SmallString15 {
    char inline_buffer[16];
    std::uint64_t length;
    std::uint64_t capacity;
};
static_assert(sizeof(SmallString15) == 0x20);

struct TreeSentinel32 {
    std::uintptr_t self;
    std::uintptr_t left;
    std::uintptr_t right;
    std::uint16_t flags;
    std::uint8_t reserved[6];
};
static_assert(sizeof(TreeSentinel32) == 0x20);

struct TreeSentinel40 {
    std::uintptr_t self;
    std::uintptr_t left;
    std::uintptr_t right;
    std::uint16_t flags;
    std::uint8_t reserved0[6];
    std::uint64_t reserved1;
};
static_assert(sizeof(TreeSentinel40) == 0x28);

struct ClientInstance {
    // Base polymorphic header.
    std::uintptr_t vfptr_000;
    std::uintptr_t qword_008;
    std::uintptr_t qword_010;
    std::uintptr_t secondary_vfptr_018;
    std::uintptr_t qword_020;
    std::uintptr_t qword_028;
    std::uint64_t qword_030;
    std::uint8_t unknown_038_077[0x40];
    std::uint32_t sentinel_078;
    std::uint32_t pad_07C;
    std::uintptr_t qword_080;
    std::uintptr_t qword_088;

    // Self/wrapper anchors.
    ClientInstance* self_090;
    SharedWrapperHeader* wrapper_098;
    std::uint64_t qword_0A0;

    // Three ctor-moved dependency slots at 0x0A8, 0x0E8, 0x128.
    std::uintptr_t moved_dep_0A8;
    std::uintptr_t moved_dep_owner_0B0;
    std::uint64_t qword_0B8;
    std::uint64_t qword_0C0;
    std::uint64_t qword_0C8;
    std::uint64_t qword_0D0;
    std::uint64_t qword_0D8;
    std::uint64_t qword_0E0;
    std::uintptr_t moved_dep_0E8;
    std::uintptr_t moved_dep_owner_0F0;
    std::uint64_t qword_0F8;
    std::uint64_t qword_100;
    std::uint64_t qword_108;
    std::uint64_t qword_110;
    std::uint64_t qword_118;
    std::uint64_t qword_120;
    std::uintptr_t moved_dep_128;
    std::uintptr_t moved_dep_owner_130;
    std::uint64_t qword_138;
    std::uint64_t qword_140;
    std::uint64_t qword_148;
    std::uint64_t qword_150;
    std::uint64_t qword_158;
    std::uint64_t qword_160;

    // Two required shared-text / shared-object triplets plus root services.
    SharedHandle required_triplet_168;
    std::uintptr_t qword_180;
    SharedHandle required_triplet_188;
    std::uintptr_t service_root_1A0;
    std::uintptr_t service_root_owner_1A8;
    std::uint64_t qword_1B0;
    std::uintptr_t world_render_this_1B8;
    std::uintptr_t qword_1C0;
    std::uintptr_t qword_1C8;
    std::uintptr_t qword_1D0;
    std::uintptr_t qword_1D8;

    // Helper block beginning with a 0xA0-byte heap object at 0x1E0.
    std::uintptr_t helper_1E0;
    std::uint64_t qword_1E8;
    std::uint64_t qword_1F0;
    std::uint64_t qword_1F8;
    std::uintptr_t qword_200;
    std::uintptr_t qword_208;
    std::uintptr_t qword_210;
    std::uintptr_t qword_218;
    std::int32_t dword_220;
    std::uint32_t pad_224;
    TreeSentinel32* tree_root_228;
    std::uint64_t qword_230;
    std::int32_t sentinel_238;
    std::uint32_t pad_23C;

    // Embedded list / route / state block.
    std::uintptr_t list_head_240;
    std::uintptr_t list_tail_248;
    std::int32_t list_count_250;
    std::uint32_t pad_254;
    std::uintptr_t embedded_ops_vfptr_258;
    std::uint8_t unknown_260_29F[0x40];
    SmallString15 route_or_command_2A0;
    std::uint16_t word_2C0;
    std::uint8_t unknown_2C2_2C7[6];
    std::uintptr_t embedded_state_vfptr_2C8;
    std::uint64_t qword_2D0;
    std::uint64_t qword_2D8;
    std::uint64_t qword_2E0;
    std::uint64_t qword_2E8;
    std::uint64_t qword_2F0;
    std::uint64_t qword_2F8;
    ClientInstance* embedded_state_self_300;
    std::uint64_t qword_308;
    std::uint64_t qword_310;
    std::uint64_t qword_318;
    std::uint32_t dword_320;
    float hash_load_factor_324;
    std::uint64_t qword_328;
    std::uint64_t qword_330;
    std::uint64_t qword_338;

    // 0x340..0x58F is still pointer- and float-heavy. Keep it raw for now.
    std::uint8_t unknown_340_58F[0x250];

    // Corrected: both are tree/sentinel roots, not guiData.
    TreeSentinel32* tree_root_590;
    std::uint64_t qword_598;
    std::uint8_t flag_5A0;
    std::uint8_t unknown_5A1_5A3[3];
    std::uint64_t qword_5A4;
    std::uint32_t dword_5AC;
    TreeSentinel40* tree_root_5B0;
    std::uint64_t qword_5B8;
    std::int32_t sentinel_5C0;
    std::uint8_t unknown_5C4_66F[0xAC];

    // Runtime-mode byte plus helper managers.
    std::uint8_t creation_mode_670;
    std::uint8_t unknown_671_677[7];
    std::uintptr_t helper_678;
    std::uint64_t qword_680;
    std::uintptr_t triple_hash_helper_688;
    std::uintptr_t small_helper_690;
    std::uint8_t flag_698;
    std::uint8_t unknown_699_69F[7];
    std::uintptr_t screen_load_tracker_6A0;
    std::uint64_t qword_6A8;
    std::uint8_t unknown_6B0_6CF[0x20];
    SmallString15 host_string_6D0;

    // Mid/late body: still under live recovery.
    std::uint8_t unknown_6F0_8BF[0x1D0];
    std::int32_t sentinel_8C0;
    std::uint32_t pad_8C4;
    std::uintptr_t qword_8C8;
    std::uint64_t qword_8D0;
    std::uint64_t qword_8D8;
    std::uint64_t qword_8E0;
    std::uint64_t qword_8E8;
    std::uintptr_t qword_8F0;
    std::uint64_t qword_8F8;
    std::uint64_t qword_900;
    std::uint64_t qword_908;
    std::uint64_t qword_910;

    // Conditional helper pair plus embedded tail subobject.
    std::uintptr_t conditional_helper_iface_918;
    std::uintptr_t conditional_helper_owner_920;
    std::uintptr_t embedded_tail_vfptr_928;
    std::uint8_t unknown_930_95F[0x30];
    ClientInstance* embedded_tail_self_960;
    std::uintptr_t embedded_tail_owner_968;
    std::uintptr_t helper_970;
    std::uintptr_t helper_978;
    std::uintptr_t helper_980;
    std::uintptr_t helper_988;
    std::uintptr_t helper_990;
    std::uint8_t unknown_998_A17[0x80];

    // Embedded owner/helper block plus late identity strings.
    std::uintptr_t hash_set_helper_A18;
    std::uintptr_t embedded_owner_vfptr_A20;
    ClientInstance* embedded_owner_self_A28;
    std::uintptr_t embedded_owner_arg1_A30;
    std::uintptr_t qword_A38;
    std::uintptr_t qword_A40;
    std::uintptr_t qword_A48;
    std::uintptr_t qword_A50;
    std::uintptr_t helper_A58;
    std::uintptr_t helper_A60;
    std::uint8_t unknown_A68_A8F[0x28];
    SmallString15 username_A90;
    SmallString15 world_name_AB0;
    std::uint8_t unknown_AD0_B17[0x48];

    SharedHandle required_triplet_B18;
    SharedHandle required_triplet_B30;
    std::uint8_t flag_B48;
    std::uint8_t unknown_B49_BD7[0x8F];

    // Tail services set after construction.
    std::uintptr_t helper_BD8;
    std::uintptr_t qword_BE0;
    std::uintptr_t qword_BE8;
    std::uintptr_t helper_BF0;
    std::uint64_t qword_BF8;
    std::uintptr_t helper_C00;
    std::uintptr_t helper_C08;
};

static_assert(sizeof(ClientInstance) == live::kConcreteSize);
static_assert(offsetof(ClientInstance, self_090) == 0x90);
static_assert(offsetof(ClientInstance, wrapper_098) == 0x98);
static_assert(offsetof(ClientInstance, world_render_this_1B8) == 0x1B8);
static_assert(offsetof(ClientInstance, route_or_command_2A0) == 0x2A0);
static_assert(offsetof(ClientInstance, tree_root_590) == 0x590);
static_assert(offsetof(ClientInstance, screen_load_tracker_6A0) == 0x6A0);
static_assert(offsetof(ClientInstance, host_string_6D0) == 0x6D0);
static_assert(offsetof(ClientInstance, conditional_helper_iface_918) == 0x918);
static_assert(offsetof(ClientInstance, embedded_tail_vfptr_928) == 0x928);
static_assert(offsetof(ClientInstance, embedded_owner_vfptr_A20) == 0xA20);
static_assert(offsetof(ClientInstance, username_A90) == 0xA90);
static_assert(offsetof(ClientInstance, world_name_AB0) == 0xAB0);
static_assert(offsetof(ClientInstance, helper_C08) == 0xC08);

inline ClientInstance* from_world_render_this(std::uintptr_t world_render_this) {
    return *reinterpret_cast<ClientInstance**>(world_render_this + live::kWorldRenderToClientOffset);
}

inline ClientInstance* from_render_entry_rcx(std::uintptr_t rcx) {
    return from_world_render_this(rcx);
}

inline SharedWrapperHeader* wrapper_from_client(ClientInstance* client) {
    return reinterpret_cast<SharedWrapperHeader*>(
        reinterpret_cast<std::uintptr_t>(client) - live::kWrapperSize);
}

inline const char* host_string(ClientInstance* client) {
    return client->host_string_6D0.inline_buffer;
}

inline const char* username(ClientInstance* client) {
    return client->username_A90.inline_buffer;
}

inline const char* world_name(ClientInstance* client) {
    return client->world_name_AB0.inline_buffer;
}

inline bool validate_live_chain(const ClientInstance* client, std::uintptr_t world_render_this) {
    return client != nullptr
        && client->self_090 == client
        && reinterpret_cast<const std::uintptr_t>(client->wrapper_098)
            == reinterpret_cast<const std::uintptr_t>(client) - live::kWrapperSize
        && client->world_render_this_1B8 == world_render_this;
}

struct LiveFieldSnapshot {
    std::ptrdiff_t offset;
    std::uintptr_t address;
    std::uintptr_t value;
    const char* name;
    const char* note;
};

inline constexpr LiveFieldSnapshot kLiveFields[] = {
    {0x090, live::kClientInstance + 0x090, live::kClientInstance,
        "self_090", "Confirmed self-pointer"},
    {0x098, live::kClientInstance + 0x098, live::kSharedWrapper,
        "wrapper_098", "Confirmed wrapper base = client - 0x10"},
    {0x1B8, live::kClientInstance + 0x1B8, live::kWorldRenderThis,
        "world_render_this_1B8", "Confirmed backlink to the world-render owner"},
    {0x590, live::kClientInstance + 0x590, 0x000002CCCE996890ull,
        "tree_root_590", "Self-linked 0x20-byte sentinel"},
    {0x5B0, live::kClientInstance + 0x5B0, 0x000002CCCE996C50ull,
        "tree_root_5B0", "Self-linked 0x28-byte sentinel"},
    {0x678, live::kClientInstance + 0x678, 0x000002CCFC58B770ull,
        "helper_678", "Heap helper allocated in ctor"},
    {0x688, live::kClientInstance + 0x688, 0x000002CCBAD23E80ull,
        "triple_hash_helper_688", "0xE8-byte helper with three hash-set blocks"},
    {0x690, live::kClientInstance + 0x690, 0x000002CCCE56AAC0ull,
        "small_helper_690", "0x38-byte helper allocated in ctor"},
    {0x6A0, live::kClientInstance + 0x6A0, 0x000002CCCE474670ull,
        "screen_load_tracker_6A0", "Ctor references 'ScreenLoadTimeTracker TaskGroup'"},
    {0x918, live::kClientInstance + 0x918, 0x000002CCB7225190ull,
        "conditional_helper_iface_918", "Conditional helper, mode-dependent"},
    {0x928, live::kClientInstance + 0x928, 0x00007FF62530DEC0ull,
        "embedded_tail_vfptr_928", "Embedded subobject vftable"},
    {0x960, live::kClientInstance + 0x960, live::kClientInstance + 0x928,
        "embedded_tail_self_960", "Embedded tail subobject self/back-pointer"},
    {0x978, live::kClientInstance + 0x978, 0x000002CCBA04A430ull,
        "helper_978", "96-byte helper object #1"},
    {0x980, live::kClientInstance + 0x980, 0x000002CCBA049780ull,
        "helper_980", "96-byte helper object #2"},
    {0x988, live::kClientInstance + 0x988, 0x000002CCCE53CE00ull,
        "helper_988", "144-byte helper object"},
    {0x990, live::kClientInstance + 0x990, 0x000002CCBA04AA50ull,
        "helper_990", "96-byte helper object #3"},
    {0xA20, live::kClientInstance + 0xA20, 0x00007FF6253168E0ull,
        "embedded_owner_vfptr_A20", "Embedded owner/helper subobject vftable"},
    {0xA28, live::kClientInstance + 0xA28, live::kClientInstance,
        "embedded_owner_self_A28", "Second self-like backlink to ClientInstance"},
    {0xC00, live::kClientInstance + 0xC00, 0x000002CCE29D7ED0ull,
        "helper_C00", "Late-bound gameplay helper"},
    {0xC08, live::kClientInstance + 0xC08, 0x000002CCE29D7EC0ull,
        "helper_C08", "Late-bound gameplay helper"},
};

struct InlineStringSnapshot {
    std::ptrdiff_t offset;
    std::uintptr_t address;
    const char* text;
    std::size_t length;
    const char* name;
};

inline constexpr InlineStringSnapshot kInlineStrings[] = {
    {0x2A0, live::kClientInstance + 0x2A0, "/play/all", 9, "route_or_command_2A0"},
    {0x6D0, live::kClientInstance + 0x6D0, "127.0.0.1", 9, "host_string_6D0"},
    {0xA90, live::kClientInstance + 0xA90, "k0nstnt1713", 11, "username_A90"},
    {0xAB0, live::kClientInstance + 0xAB0, "My World", 8, "world_name_AB0"},
};

struct PointeeVtableSnapshot {
    std::ptrdiff_t offset;
    std::uintptr_t value;
    std::uintptr_t pointee_vfptr;
    std::ptrdiff_t pointee_vfptr_rva;
    const char* note;
};

inline constexpr PointeeVtableSnapshot kPointeeVftables[] = {
    {0x1E0, 0x000002CCCE9CFF50ull, 0x00007FF625380768ull, 0x84D0768,
        "0xA0-byte helper allocated directly in ClientInstance::ClientInstance"},
    {0x678, 0x000002CCFC58B770ull, 0x00007FF625304DD8ull, 0x8454DD8,
        "0xC8-byte helper allocated directly in ClientInstance::ClientInstance"},
    {0x688, 0x000002CCBAD23E80ull, 0x00007FF6253A28B8ull, 0x84F28B8,
        "0xE8-byte helper with three internal hash-set blocks"},
    {0x690, 0x000002CCCE56AAC0ull, 0x00007FF6253A28C0ull, 0x84F28C0,
        "0x38-byte helper allocated directly in ClientInstance::ClientInstance"},
    {0x6A0, 0x000002CCCE474670ull, 0x00007FF62533FF90ull, 0x848FF90,
        "Screen-load-time tracker helper"},
    {0x918, 0x000002CCB7225190ull, 0x00007FF6253892C8ull, 0x84D92C8,
        "Conditional helper interface"},
    {0x978, 0x000002CCBA04A430ull, 0x00007FF6253051F8ull, 0x84551F8,
        "96-byte helper object #1"},
    {0x980, 0x000002CCBA049780ull, 0x00007FF6253051F8ull, 0x84551F8,
        "96-byte helper object #2"},
    {0x988, 0x000002CCCE53CE00ull, 0x00007FF6254554C0ull, 0x85A54C0,
        "144-byte helper object"},
    {0x990, 0x000002CCBA04AA50ull, 0x00007FF6253051F8ull, 0x84551F8,
        "96-byte helper object #3"},
    {0xC00, 0x000002CCE29D7ED0ull, 0x00007FF6253AE2D8ull, 0x84FE2D8,
        "Late-bound runtime helper"},
    {0xC08, 0x000002CCE29D7EC0ull, 0x00007FF6253ADE38ull, 0x84FDE38,
        "Late-bound runtime helper"},
};

} // namespace mc_1_21_130::client_instance
