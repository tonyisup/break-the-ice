import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        # "legal" is visible for guests.
        # "storage-limit" is also visible for guests.
        await page.goto("http://localhost:5173/settings?expand=legal")
        await page.wait_for_timeout(2000)
        await page.screenshot(path="/home/jules/verification/settings_legal_expanded.png")

        # Check if legal section is expanded.
        # CollapsibleSection usually has some indicator or the content is visible.
        # Based on the screenshot, expanded sections have content below them.

        await browser.close()

asyncio.run(main())
