/** Cosine similarity with defensive checks: null/length and zero-norm guards. */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (!a || !b || a.length !== b.length || a.length === 0) return 0;
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

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
