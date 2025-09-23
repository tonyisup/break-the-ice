from playwright.sync_api import sync_playwright, Page, expect

def verify_filtering(page: Page):
    """
    This function verifies the filtering functionality on the history and liked pages.
    """

    # Add a listener for console events
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    # Main page
    page.goto("http://localhost:5173/app")
    page.screenshot(path="jules-scratch/verification/debug_main_page.png")
    expect(page.get_by_role("button", name="Randomize Style")).to_be_visible()

    # Like a few questions
    for i in range(3):
        page.get_by_role("button", name="Like").click()
        page.get_by_role("button", name="Next").click()
        page.wait_for_timeout(500) # wait for the next question to load

    # History page
    page.goto("http://localhost:5173/history")
    expect(page.get_by_role("link", name="History")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/history_page.png")

    # Liked page
    page.goto("http://localhost:5173/liked")
    expect(page.get_by_role("link", name="Liked")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/liked_page.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_filtering(page)
        browser.close()

if __name__ == "__main__":
    main()
