from playwright.sync_api import sync_playwright, expect
import time

def debug_settings_page(page):
    print("Navigating to settings...")
    page.goto("http://localhost:5173/settings")
    time.sleep(2) # Wait for hydration

    print("Taking debug screenshot...")
    page.screenshot(path="verification/debug_settings.png")

    # Check if "Storage Limit Behavior" is present in text content
    content = page.content()
    if "Storage Limit Behavior" in content:
        print("Found 'Storage Limit Behavior' in content")
    else:
        print("'Storage Limit Behavior' NOT found in content")
        # Check if Signed In
        if "Sign Out" in content or "User Button" in content:
            print("User appears to be SIGNED IN")
        else:
            print("User appears to be SIGNED OUT")

def verify_likes_limit_shake(page):
    print("Navigating to app for shake test...")
    # 1. Go to homepage
    page.goto("http://localhost:5173/app")

    # Wait for the card to load
    try:
        page.wait_for_selector("text=Generating question...", state="hidden", timeout=10000)
    except:
        print("Timeout waiting for generator to finish. taking screenshot.")
        page.screenshot(path="verification/timeout_app.png")
        return

    # Mock local storage
    print("Injecting local storage...")
    page.evaluate("""
        localStorage.setItem('likedQuestions', JSON.stringify(['id1', 'id2', 'id3', 'id4', 'id5']));
        localStorage.setItem('storageLimitBehavior', '"block"');
        window.dispatchEvent(new Event('storage'));
    """)

    page.reload()
    try:
        page.wait_for_selector("text=Generating question...", state="hidden", timeout=10000)
    except:
        pass

    # 2. Check header badge
    print("Checking for badge...")
    # Header logic: showFullBadge = !isSignedIn && (likedQuestions.length >= likedLimit)
    # Badge is an absolute div with bg-red-500.

    try:
        # Locate the badge more generically
        red_badges = page.locator(".bg-red-500.rounded-full.border-2").all()
        print(f"Found {len(red_badges)} red badges")

        if len(red_badges) > 0:
             print("Badge verification passed (visually)")
        else:
             print("Badge NOT found")
    except Exception as e:
        print(f"Badge check failed: {e}")


    # 3. Try to like the current question
    print("Attempting to like...")
    like_button = page.locator("button[title='Toggle favorite']")

    if like_button.count() > 0:
        like_button.click()

        # 4. Verify Shake
        print("Verifying shake class...")
        # We expect the button to have class 'animate-shake' temporarily.
        # Check immediately
        classes = like_button.get_attribute("class")
        if "animate-shake" in classes:
            print("Shake animation detected!")
        else:
            print(f"Shake animation NOT detected. Classes: {classes}")

        page.screenshot(path="verification/shake_verification.png")
    else:
        print("Like button not found")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            debug_settings_page(page)
            verify_likes_limit_shake(page)
        except Exception as e:
            print(f"Fatal Error: {e}")
        finally:
            browser.close()
