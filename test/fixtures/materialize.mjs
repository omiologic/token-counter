export function materializeFixture(input) {
  switch (input.kind) {
    case "literal":
      return input.text;
    case "repeat":
      return input.text.repeat(input.repetitions);
    case "numbered-lines":
      return Array.from(
        { length: input.lines },
        (_, index) =>
          `row-${index}: alpha-${index % 17}, beta-${(index * 7) % 101}\n`,
      ).join("");
    default:
      throw new Error("Unsupported fixture input recipe.");
  }
}
