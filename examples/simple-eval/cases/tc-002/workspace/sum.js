// Buggy: starts at index 1 instead of 0
export function sum(xs) {
  let total = 0;
  for (let i = 1; i < xs.length; i++) total += xs[i];
  return total;
}
