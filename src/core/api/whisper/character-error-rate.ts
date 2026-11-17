export interface CharacterErrorRate {
  referenceCharacters: number;
  editDistance: number;
  rate: number | null;
}

/**
 * Japanese ASR evaluation ignores whitespace and punctuation so transcript
 * formatting differences do not hide recognition changes. NFKC also makes
 * full-width and half-width forms comparable; letters are case-insensitive.
 */
function normalizeForEvaluation(text: string): string[] {
  return Array.from(
    text
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/[\s\p{P}]/gu, ""),
  );
}

/** Returns Unicode-code-point CER; rate is null when the normalized reference is empty. */
export function calculateCharacterErrorRate(
  reference: string,
  hypothesis: string,
): CharacterErrorRate {
  const referenceCharacters = normalizeForEvaluation(reference);
  const hypothesisCharacters = normalizeForEvaluation(hypothesis);
  const editDistance = calculateEditDistance(referenceCharacters, hypothesisCharacters);

  return {
    referenceCharacters: referenceCharacters.length,
    editDistance,
    rate: referenceCharacters.length === 0 ? null : editDistance / referenceCharacters.length,
  };
}

function calculateEditDistance(reference: string[], hypothesis: string[]): number {
  let previousRow = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);

  for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex += 1) {
    const currentRow = [referenceIndex];

    for (let hypothesisIndex = 1; hypothesisIndex <= hypothesis.length; hypothesisIndex += 1) {
      const substitutionCost =
        reference[referenceIndex - 1] === hypothesis[hypothesisIndex - 1] ? 0 : 1;

      currentRow[hypothesisIndex] = Math.min(
        currentRow[hypothesisIndex - 1] + 1,
        previousRow[hypothesisIndex] + 1,
        previousRow[hypothesisIndex - 1] + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[hypothesis.length];
}
