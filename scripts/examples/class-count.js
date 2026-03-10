const classes = await api.listClasses();

return {
  classCount: classes.classes.length,
  echoArgs: args,
};
