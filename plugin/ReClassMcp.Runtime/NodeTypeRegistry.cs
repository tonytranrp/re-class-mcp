using System;
using System.Collections.Generic;
using System.Linq;
using ReClassNET.Nodes;

namespace ReClassMcp.Runtime
{
    internal sealed class NodeTypeEntry
    {
        public string Name { get; set; }

        public string DisplayName { get; set; }

        public Type Type { get; set; }
    }

    internal static class NodeTypeRegistry
    {
        private static readonly Dictionary<string, NodeTypeEntry> Entries =
            new Dictionary<string, NodeTypeEntry>(StringComparer.OrdinalIgnoreCase);

        static NodeTypeRegistry()
        {
            Register<Int8Node>("int8", "Int8", "i8");
            Register<Int16Node>("int16", "Int16", "i16");
            Register<Int32Node>("int32", "Int32", "i32");
            Register<Int64Node>("int64", "Int64", "i64");
            Register<UInt8Node>("uint8", "UInt8", "u8", "byte");
            Register<UInt16Node>("uint16", "UInt16", "u16");
            Register<UInt32Node>("uint32", "UInt32", "u32");
            Register<UInt64Node>("uint64", "UInt64", "u64");
            Register<FloatNode>("float", "Float", "f32");
            Register<DoubleNode>("double", "Double", "f64");

            Register<Hex8Node>("hex8", "Hex8");
            Register<Hex16Node>("hex16", "Hex16");
            Register<Hex32Node>("hex32", "Hex32");
            Register<Hex64Node>("hex64", "Hex64");

            Register<BoolNode>("bool", "Bool");
            Register<BitFieldNode>("bitfield", "BitField");
            Register<EnumNode>("enum", "Enum");

            Register<Vector2Node>("vector2", "Vector2");
            Register<Vector3Node>("vector3", "Vector3");
            Register<Vector4Node>("vector4", "Vector4");
            Register<Matrix3x3Node>("matrix3x3", "Matrix3x3");
            Register<Matrix3x4Node>("matrix3x4", "Matrix3x4");
            Register<Matrix4x4Node>("matrix4x4", "Matrix4x4");

            Register<Utf8TextNode>("utf8text", "Utf8Text", "string");
            Register<Utf8TextPtrNode>("utf8textptr", "Utf8TextPtr", "stringptr");
            Register<Utf16TextNode>("utf16text", "Utf16Text", "wstring");
            Register<Utf16TextPtrNode>("utf16textptr", "Utf16TextPtr", "wstringptr");
            Register<Utf32TextNode>("utf32text", "Utf32Text");
            Register<Utf32TextPtrNode>("utf32textptr", "Utf32TextPtr");

            Register<PointerNode>("pointer", "Pointer", "ptr");
            Register<ArrayNode>("array", "Array");
            Register<UnionNode>("union", "Union");
            Register<ClassInstanceNode>("classinstance", "ClassInstance", "instance");
            Register<VirtualMethodTableNode>("virtualmethodtable", "VirtualMethodTable", "vtable");
            Register<FunctionNode>("function", "Function");
            Register<FunctionPtrNode>("functionptr", "FunctionPtr");
        }

        public static IReadOnlyList<NodeTypeEntry> List()
        {
            return Entries
                .Values
                .GroupBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public static Type Resolve(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName))
            {
                return null;
            }

            return Entries.TryGetValue(typeName, out var entry) ? entry.Type : null;
        }

        private static void Register<TNode>(string name, string displayName, params string[] aliases)
            where TNode : BaseNode
        {
            AddEntry(name, displayName, typeof(TNode));
            foreach (var alias in aliases ?? Array.Empty<string>())
            {
                AddEntry(alias, displayName, typeof(TNode));
            }
        }

        private static void AddEntry(string name, string displayName, Type type)
        {
            Entries[name] = new NodeTypeEntry
            {
                Name = name,
                DisplayName = displayName,
                Type = type,
            };
        }
    }
}
