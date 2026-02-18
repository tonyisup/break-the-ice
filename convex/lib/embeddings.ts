export const calculateAverageEmbedding = (embeddings: number[][]) => {
	const validEmbeddings = embeddings.filter((e) => e && e.length > 0);

	if (validEmbeddings.length === 0) {
		return [];
	}

	const embeddingLength = validEmbeddings[0].length;
	const sumEmbedding = new Array(embeddingLength).fill(0);

	let validCount = 0;
	for (const embedding of validEmbeddings) {
		if (embedding.length !== embeddingLength) {
			console.warn("Embedding length mismatch ignoring:", embedding.length);
			continue;
		}
		for (let i = 0; i < embeddingLength; i++) {
			sumEmbedding[i] += embedding[i];
		}
		validCount++;
	}

	if (validCount === 0) {
		return [];
	}

	return sumEmbedding.map((value) => value / validCount);
};
