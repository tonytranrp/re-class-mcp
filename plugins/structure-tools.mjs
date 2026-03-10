export default {
  name: "structure-tools",
  version: "1.0.0",
  description: "Example hot-reloaded structure dumping helpers.",
  actions: {
    dumpClass: {
      description: "Dump one class using the built-in dumpStructure helper.",
      async run({ api, args }) {
        return await api.dumpStructure(args.identifier, {
          format: args.format ?? "json",
          outputPath: args.outputPath,
          includeContent: args.includeContent ?? true,
        });
      },
    },
    dumpMatches: {
      description: "Dump all classes matching a query using the built-in dumpStructures helper.",
      async run({ api, args }) {
        return await api.dumpStructures({
          query: args.query,
          format: args.format ?? "markdown",
          outputDir: args.outputDir,
          concurrency: args.concurrency ?? 4,
          includeContent: args.includeContent ?? !args.outputDir,
        });
      },
    },
    classCount: {
      description: "Return the current class count from ReClass.",
      async run({ api }) {
        const result = await api.listClasses();
        return {
          classCount: result.classes.length,
        };
      },
    },
  },
};
