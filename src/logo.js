export const LOGO_LINES = [
  "###### ##  ## #### ##     ##     ##  ## #### ##     ##",
  "##     ## ##   ##  ##     ##     ## ##   ##  ##     ##",
  "###### ####    ##  ##     ##     ####    ##  ##     ##",
  "    ## ## ##   ##  ##     ##     ## ##   ##  ##     ##",
  "###### ##  ## #### ###### ###### ##  ## #### ###### ######",
  "  ....   ..     ..     ..     ..   ..     ..     ..     ..",
];

export function renderLogo({ color = (value) => value } = {}) {
  return LOGO_LINES.map((line) => color(line)).join("\n");
}
