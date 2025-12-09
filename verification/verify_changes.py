from playwright.sync_api import sync_playwright, expect
import time

def verify_likes_limit_shake(page):
    # Set the local storage to simulate a nearly full liked list (anon user)
    # MAX_ANON_LIKED is likely 5. Let's preset 5 liked questions.
    # Note: We need to set this before the page loads or right after.

    # 1. Go to homepage
    page.goto("http://localhost:5173/app")

    # Wait for the card to load
    page.wait_for_selector("text=Generating question...", state="hidden", timeout=10000)

    # Mock local storage
    # We need to set 'likedQuestions' in localStorage.
    # The format is a JSON array of strings (Ids).
    # We'll use fake IDs.
    page.evaluate("""
        localStorage.setItem('likedQuestions', JSON.stringify(['id1', 'id2', 'id3', 'id4', 'id5']));
        localStorage.setItem('storageLimitBehavior', '"block"');
        window.dispatchEvent(new Event('storage'));
    """)

    page.reload()
    page.wait_for_selector("text=Generating question...", state="hidden", timeout=10000)

    # 2. Check header badge
    # We are at 5/5. Badge should be red (Limit reached).
    # Header logic: showFullBadge = !isSignedIn && (likedQuestions.length >= likedLimit)
    # Badge is an absolute div with bg-red-500.

    # Locate the "Liked" button container. It contains the text "Liked" and the heart icon.
    # The badge is in the parent div of the Link.
    # Let's look for the red dot.
    red_badge = page.locator("div.bg-red-500").first
    expect(red_badge).to_be_visible()

    # 3. Try to like the current question
    # The heart button.
    like_button = page.locator("button[title='Toggle favorite']")

    # Click it
    like_button.click()

    # 4. Verify Shake
    # We expect the button to have class 'animate-shake' temporarily.
    # Since it's temporary (500ms), we might miss it if we check too late.
    # But Playwright is fast.
    expect(like_button).to_have_class(lambda s: "animate-shake" in s)

    # Take screenshot of shake
    page.screenshot(path="verification/shake_verification.png")

    # 5. Verify Action Blocked
    # The heart should NOT turn red (filled).
    # The icon inside usually has class 'text-red-500' if liked.
    # If blocked, it should remain gray.
    heart_icon = like_button.locator("svg")
    expect(heart_icon).not_to_have_class(lambda s: "text-red-500" in s)

def verify_settings_page(page):
    page.goto("http://localhost:5173/settings")

    # Expand "Storage Limit Behavior" section if needed (it might be collapsed)
    # It has title "Storage Limit Behavior".
    storage_section = page.get_by_text("Storage Limit Behavior")
    storage_section.click()

    # Check if options are visible
    block_option = page.locator("input[value='block']")
    replace_option = page.locator("input[value='replace']")

    expect(block_option).to_be_visible()
    expect(replace_option).to_be_visible()

    # Take screenshot
    page.screenshot(path="verification/settings_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            print("Verifying Settings Page...")
            verify_settings_page(page)
            print("Verifying Likes Limit & Shake...")
            verify_likes_limit_shake(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
