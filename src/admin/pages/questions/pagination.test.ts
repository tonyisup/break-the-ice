import { describe, expect, it } from "vitest"
import { ADMIN_QUESTIONS_PAGE_SIZE, paginateQuestions } from "./pagination"

describe("admin question pagination", () => {
	it("limits each page to a readable set of questions", () => {
		const questions = Array.from({ length: 60 }, (_, index) => `question-${index + 1}`)

		expect(paginateQuestions(questions, 1)).toHaveLength(ADMIN_QUESTIONS_PAGE_SIZE)
		expect(paginateQuestions(questions, 1)[0]).toBe("question-1")
		expect(paginateQuestions(questions, 2)[0]).toBe("question-26")
		expect(paginateQuestions(questions, 3)).toEqual(questions.slice(50))
	})
})
