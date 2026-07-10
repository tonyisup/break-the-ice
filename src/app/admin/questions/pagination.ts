export const ADMIN_QUESTIONS_PAGE_SIZE = 25

export function paginateQuestions<T>(items: T[], page: number) {
	const safePage = Math.max(1, page)
	const start = (safePage - 1) * ADMIN_QUESTIONS_PAGE_SIZE

	return items.slice(start, start + ADMIN_QUESTIONS_PAGE_SIZE)
}
