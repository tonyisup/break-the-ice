import { describe, expect, it } from "vitest"
import {
	ADMIN_QUESTIONS_MOBILE_PAGE_SIZE,
	getAdminQuestionPageSize,
	paginateQuestions,
} from "./pagination"

describe("mobile admin question pagination", () => {
	it("keeps the mobile question list to ten compact records", () => {
		const questions = Array.from({ length: 25 }, (_, index) => `question-${index + 1}`)
		const pageSize = getAdminQuestionPageSize(true)

		expect(pageSize).toBe(ADMIN_QUESTIONS_MOBILE_PAGE_SIZE)
		expect(paginateQuestions(questions, 1, pageSize)).toEqual(questions.slice(0, 10))
		expect(paginateQuestions(questions, 2, pageSize)).toEqual(questions.slice(10, 20))
	})
})
