import { _, it, lift } from 'param.macro';

/**
 * @typedef {object} Match
 * @property {number} patternIndex The index of the pattern word.
 * @property {number} stringIndex The index of the string word (-1 if there was no match).
 * @property {number} score The similarity score between the two words (0 if there was no match).
 */

/**
 * @param {string[][]} pattern A list of lists of choices comprised of single words.
 * @param {string[]} string A list of words.
 * @param {Function} compareWords A comparison function for words.
 * @returns {number[][]} A matrix holding the similarity scores for each pair of words.
 */
function getSimilarityMatrix(pattern, string, compareWords) {
  const similarityMatrix = [];

  for (let i = 0; i < string.length; i++) {
    similarityMatrix.push([]);

    for (let j = 0; j < pattern.length; j++) {
      const scores = pattern[j].map(compareWords(_, string[i]));
      let score = Math.max(...scores);
      similarityMatrix[i].push(score);
    }
  }

  return similarityMatrix;
}

/**
 * @param {number[][]} similarityMatrix A matrix holding the similarity scores for each pair of words.
 * @returns {Match[]} A list of matches corresponding to the best possible mapping between words.
 */
function findWordMatches(similarityMatrix) {
  let matches = [];
  let unMatchedRows = new Set();
  let unMatchedColumns = new Set();

  for (let i = 0; i < similarityMatrix[0].length; i++) {
    matches.push({
      patternIndex: i,
      stringIndex: -1,
      score: 0,
    });

    unMatchedRows.add(i);
  }

  for (let i = 0; i < similarityMatrix.length; i++) {
    unMatchedColumns.add(i);
  }

  let hasChanged = true;

  while (hasChanged && unMatchedRows.size && unMatchedColumns.size) {
    hasChanged = false;

    for (let row of unMatchedRows) {
      if (unMatchedColumns.size === 0) {
        break;
      }

      let bestColumn = -1;
      let columnMaxScore = 0;

      for (let column of unMatchedColumns) {
        let score = similarityMatrix[column][row];

        if (score > columnMaxScore) {
          columnMaxScore = score;
          bestColumn = column;
        }
      }

      let bestColumnRow = -1;
      let columnRowMaxScore = 0;

      if (bestColumn >= 0) {
        for (let columnRow of unMatchedRows) {
          let score = similarityMatrix[bestColumn][columnRow];

          if (score > columnRowMaxScore) {
            columnRowMaxScore = score;
            bestColumnRow = columnRow;
          }
        }
      }

      if (bestColumnRow === row) {
        matches[bestColumnRow] = {
          patternIndex: row,
          stringIndex: bestColumn,
          score: columnRowMaxScore,
        };

        hasChanged = true;

        if (bestColumnRow >= 0) {
          unMatchedRows.delete(bestColumnRow);
        }

        if (bestColumn >= 0) {
          unMatchedColumns.delete(bestColumn);
        }
      }
    }
  }

  return matches;
}

/**
 * @param {Match[]} matches A list of matches between a pattern and a string.
 * @param {number} stringLength The length of the compared string.
 * @returns {number} A similarity score for the word order.
 */
function getOrderScore(matches, stringLength) {
  let totalOffset = 0;
  let matchedCount = 0;

  matches.forEach(({ patternIndex, stringIndex }) => {
    if (patternIndex >= 0) {
      matchedCount++;
      totalOffset += patternIndex - stringIndex;
    }
  });

  if (0 === matchedCount) {
    return 0.0;
  }

  totalOffset = totalOffset / matchedCount;
  let orderScore = 0;
  let totalLength = Math.max(matches.length, stringLength);

  matches.forEach(({ patternIndex, stringIndex }) => {
    if (patternIndex >= 0) {
      orderScore += 1.0 - Math.abs(patternIndex - stringIndex - totalOffset) / totalLength;
    }
  });

  return (orderScore / matchedCount - 0.5) / 0.5;
}

/**
 * @param {string[][]} pattern A list of lists of choices comprised of single words.
 * @param {string[]} string A list of words.
 * @param {Function} compareWords A comparison function for words.
 * @returns {number} The similarity score between the pattern and the string.
 */
function getSimilarityScore(pattern, string, compareWords) {
  const matches = findWordMatches(getSimilarityMatrix(pattern, string, compareWords));

  return (1.0 / string.length)
    * matches.reduce(lift(_ + _.score), 0)
    * getOrderScore(matches, string.length);
}

/**
 * @param {string[][][]} pattern A list of lists of choices comprised of single and/or composite words.
 * @param {string[]} string A list of words.
 * @param {Function} compareWords A comparison function for words.
 * @returns {number} The similarity score between the pattern and the string.
 */
export default function compareStringWithPattern(pattern, string, compareWords) {
  // Find the tokens that contain composite words, if any.
  const complexTokens = pattern.map(
    (token, index) => {
      const [ compositeWords, singleWords ] = partition(
        token,
        word => Array.isArray(word) && (word.length > 1)
      );

      return (0 === compositeWords.length)
        ? null
        : {
          index,
          choices: compositeWords
            // Composite words will be used in dedicated patterns, with each part as one single choice.
            .map(it.map([ it ]))
            // Single words will be used together as one multiple choice.
            .concat([ [ singleWords ] ])
            // Clean everything to make sure we don't end up with redundant patterns.
            .filter(it.every(it.length > 0))
        }
    })
    .filter(Boolean)
    .reverse();

  // Build the pattern base comprised of the common tokens.
  const patternBase = complexTokens.reduce(
    (result, { index }) => {
      result.splice(index, 1);
      return result;
    },
    [ ...pattern ]
  );

  // Build every possible pattern.
  const patterns = complexTokens.reduce(
    (result, token, index) => result.flatMap(
      base => token.choices.map(
        choice => {
          const insertAt = token.index - complexTokens.length + index + 1;
          const subPattern = [ ...base ];
          subPattern.splice(insertAt, 0, ...choice);
          return subPattern;
        }
      )
    ),
    [ patternBase ]
  );

  // Test each pattern and keep the best score.
  return patterns.reduce(
    (bestScore, pattern) => {
      return (1 === bestScore)
        ? bestScore
        : Math.max(
          bestScore,
          getSimilarityScore(pattern, string, compareWords)
        );
    },
    0
  );
}

/**
 * @param {Array} values A list of values.
 * @param {Function} predicate A predicate.
 * @returns {Array} The given values split into two groups (matching and not matching the predicate).
 */
function partition(values, predicate) {
  return values.reduce(
    (result, value) => {
      result[predicate(value) ? 0 : 1].push(value);
      return result;
    },
    [ [], [] ]
  )
}
