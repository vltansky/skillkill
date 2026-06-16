export function shouldUseColor(stream) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  if (typeof stream.hasColors === "function") return stream.hasColors();
  if (typeof stream.getColorDepth === "function") return stream.getColorDepth() > 1;
  return false;
}

export function colors(enabled) {
  const wrap = (code, value) => (enabled ? `\x1b[${code}m${value}\x1b[0m` : value);
  return {
    title: (value) => wrap("1;36", value),
    header: (value) => wrap("1;34", value),
    dim: (value) => wrap("2", value),
    info: (value) => wrap("36", value),
    good: (value) => wrap("1;32", value),
    warn: (value) => wrap("1;33", value),
    danger: (value) => wrap("1;31", value),
    token: (value) => wrap("33", value),
    usage: (value, amount) => wrap(Number(amount) > 0 ? "1;35" : "2", value),
    risk: (value, risk) => {
      if (risk === "low") return wrap("32", value);
      if (risk === "medium") return wrap("1;33", value);
      if (risk === "protected") return wrap("36", value);
      if (risk === "none") return wrap("2", value);
      return value;
    },
  };
}
