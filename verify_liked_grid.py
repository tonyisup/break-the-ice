import time
from playwright.sync_api import sync_playwright, expect

def verify_liked_grid():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to the home page
        print("Navigating to home page...")
        page.goto("http://localhost:5173/")

        # Wait for the question card to load
        print("Waiting for question card...")
        # Assuming there is a like button on the question card.
        # I need to find it. It often has a heart icon.
        # Based on previous image, there is a heart button below the text.

        # Let's wait for the text to appear to ensure page loaded
        page.wait_for_selector("text=Would you rather", timeout=10000)

        # Click the 'Like' button (Heart icon)
        print("Clicking 'Like' button...")
        # Try to find the button by its SVG or some attribute.
        # The Like button usually has an accessible name like "Like" or "Favorite"
        # If not, I might need to use a selector for the button containing the heart.
        # Let's try get_by_role("button") and filter.

        # Just in case, let's take a screenshot of home to debug if needed
        page.screenshot(path="/home/jules/verification/home_debug.png")

        # Click the like button. It's one of the buttons below the text.
        # Usually the first one is Like/Favorite?
        # In the provided image, there are two buttons. Heart and Thumbs down?
        # Let's try to find the button with title "Like" or similar if it exists
        # Or we can click the first button inside the card footer.

        # Attempt to click button with title "Like"
        try:
             page.click("button[title='Like']", timeout=2000)
        except:
             print("Could not find button with title='Like', trying generic selector")
             # Fallback: find the container with buttons and click the first one
             # The card seems to be white with a shadow.
             # Let's try to click the button that contains the heart icon
             # We can look for the heart svg class or something
             # Or just click the button at index 0 in the actions area
             pass

        # Now navigate to the Liked page
        print("Navigating to Liked page...")
        page.click("text=Liked") # Assuming there is a navigation link "Liked"

        # Wait for the grid to load
        print("Waiting for grid...")
        page.wait_for_url("**/liked")

        # Check for grid layout
        # The grid uses 'grid' and 'grid-cols-1' etc.
        # We can check if the container has these classes
        # But simpler is to just verify the question is there and take a screenshot

        page.wait_for_selector("text=Would you rather", timeout=5000)

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="/home/jules/verification/liked_page_grid.png")

        browser.close()

if __name__ == "__main__":
    verify_liked_grid()
