from playwright.sync_api import sync_playwright

def verify_logs(page):
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

    print("Navigating to settings...")
    try:
        page.goto("http://localhost:5173/settings")
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"Navigation failed: {e}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_logs(page)
        finally:
            browser.close()
