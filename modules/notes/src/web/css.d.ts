// Side-effect CSS imports (BlockNote's stylesheets and the editor theme
// overrides) carry no types; declare them so the module typechecks on its
// own, the way the web app declares them for its bundle.
declare module "*.css";
