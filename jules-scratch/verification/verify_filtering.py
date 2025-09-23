from playwright.sync_api import sync_playwright, Page, expect

def verify_filtering(page: Page):
    """
    This function verifies the filtering functionality on the history and liked pages,
    and also checks that the main page is still working correctly.
    """

    # Add a listener for console events
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    # History page
    page.goto("http://localhost:5173/history")
    expect(page.get_by_role("link", name="History")).to_be_visible()

    try:
        # Click on the first style and tone
        page.locator('[data-testid="style-selector-button"]').first.click(timeout=5000)
        page.locator('[data-testid="tone-selector-button"]').first.click(timeout=5000)
    except Exception as e:
        print(f"Could not select style and tone on history page: {e}")

    page.screenshot(path="jules-scratch/verification/history_page_filtered.png")

    # Liked page
    page.goto("http://localhost:5173/liked")
    expect(page.get_by_role("link", name="Liked")).to_be_visible()

    try:
        # Click on the first style and tone
        page.locator('[data-testid="style-selector-button"]').first.click(timeout=5000)
        page.locator('[data-testid="tone-selector-button"]').first.click(timeout=5000)
    except Exception as e:
        print(f"Could not select style and tone on liked page: {e}")

    page.screenshot(path="jules-scratch/verification/liked_page_filtered.png")

    # Main page
    page.goto("http://localhost:5173/app")
    expect(page.get_by_role("button", name="Randomize Style")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/main_page.png")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_filtering(page)
        browser.close()

if __name__ == "__main__":
    main()
