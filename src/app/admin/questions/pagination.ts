export const ADMIN_QUESTIONS_PAGE_SIZE = 25
export const ADMIN_QUESTIONS_MOBILE_PAGE_SIZE = 10

export function getAdminQuestionPageSize(isMobile: boolean) {
	return isMobile ? ADMIN_QUESTIONS_MOBILE_PAGE_SIZE : ADMIN_QUESTIONS_PAGE_SIZE
}

export function paginateQuestions<T>(items: T[], page: number, pageSize = ADMIN_QUESTIONS_PAGE_SIZE) {
	const safePage = Math.max(1, page)
	const start = (safePage - 1) * pageSize

	return items.slice(start, start + pageSize)
}
