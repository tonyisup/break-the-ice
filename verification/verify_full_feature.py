from playwright.sync_api import sync_playwright, expect
import time

def verify_feature(page):
    print("Navigating to Test Verification Page...")
    page.goto("http://localhost:5173/test-verification")

    # Wait for page to load
    page.wait_for_selector("h1:has-text('Verification Page')")

    # 1. Fill Likes to Limit
    print("Filling likes to limit...")
    page.click("text=Fill Likes to Limit")

    # Wait for badge to appear (Red badge for limit reached)
    print("Checking for limit badge...")
    red_badge = page.locator(".bg-red-500.rounded-full.border-2").first
    expect(red_badge).to_be_visible()

    # 2. Set behavior to 'block'
    print("Setting behavior to block via localStorage...")
    page.evaluate("localStorage.setItem('storageLimitBehavior', '\"block\"'); window.dispatchEvent(new Event('storage'));")
    # Need to reload or force re-render? The context listens to local storage changes?
    # useLocalStorage implementation uses 'window.addEventListener("storage", ...)' but that only triggers on OTHER tabs.
    # However, useLocalStorage from `src/hooks/useLocalStorage.ts` usually has a `setValue` that updates state.
    # We are updating directly. We might need to reload.
    page.reload()
    page.click("text=Fill Likes to Limit") # Ensure filled again just in case

    # 3. Try to like the test question
    print("Attempting to like when full (Block mode)...")
    like_button = page.locator("button[title='Toggle favorite']")
    like_button.click()

    # Verify Shake
    print("Verifying shake...")
    expect(like_button).to_have_class(lambda s: "animate-shake" in s)
    page.screenshot(path="verification/shake_block.png")

    # Verify it was NOT liked (Heart should be gray)
    heart_icon = like_button.locator("svg")
    expect(heart_icon).not_to_have_class(lambda s: "text-red-500" in s)
    print("Block verified: Item was not liked.")

    # 4. Change behavior to 'replace'
    print("Changing behavior to replace...")
    page.evaluate("localStorage.setItem('storageLimitBehavior', '\"replace\"');")
    page.reload()
    page.click("text=Fill Likes to Limit")

    # 5. Try to like again
    print("Attempting to like when full (Replace mode)...")
    # Note: re-finding element after reload
    like_button = page.locator("button[title='Toggle favorite']")
    like_button.click()

    # Verify Shake (should still shake as requested)
    print("Verifying shake...")
    expect(like_button).to_have_class(lambda s: "animate-shake" in s)

    # Verify it WAS liked (Heart should be red)
    heart_icon = like_button.locator("svg")
    expect(heart_icon).to_have_class(lambda s: "text-red-500" in s)
    page.screenshot(path="verification/shake_replace.png")
    print("Replace verified: Item was liked.")

def verify_settings(page):
    print("Navigating to Settings...")
    page.goto("http://localhost:5173/settings")

    # Expand Storage Limit Behavior
    print("Expanding Storage Limit Behavior section...")
    section = page.get_by_text("Storage Limit Behavior")
    section.click()

    expect(page.locator("input[value='block']")).to_be_visible()
    expect(page.locator("input[value='replace']")).to_be_visible()
    page.screenshot(path="verification/settings_options.png")
    print("Settings verified.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_feature(page)
            verify_settings(page)
        except Exception as e:
            print(f"FAILED: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
