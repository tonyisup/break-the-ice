from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:5173/admin/duplicates")
    page.wait_for_selector(".space-y-3")

    # Get the first duplicate set
    first_set = page.query_selector(".space-y-6 > div")

    if first_set:
        # Get all questions in the set
        questions = first_set.query_selector_all(".space-y-3 > div")

        if len(questions) > 1:
            # Click the first question to keep it
            questions[0].click()

            # Take a screenshot to verify the changes
            page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
