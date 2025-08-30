#!/usr/bin/env python3
"""
Script to populate the category field for existing questions in the Convex database.
This script uses Convex's HTTP API to update question categories.
"""

import requests
import json
import time
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration - Load from environment variables
CONVEX_URL = os.getenv("CONVEX_URL", "https://your-deployment.convex.cloud")
API_KEY = os.getenv("CONVEX_API_KEY", "your-api-key")

# Category mapping based on keywords and patterns
CATEGORY_KEYWORDS = {
    "fun": [
        "funny", "joke", "silly", "embarrassing", "weird", "crazy", "hilarious",
        "awkward", "fun", "entertainment", "humor", "amusing", "ridiculous",
        "favorite", "best", "worst", "strange", "unusual"
    ],
    "deep": [
        "meaning", "purpose", "philosophy", "belief", "value", "important",
        "significant", "life", "death", "existence", "soul", "spirit",
        "introspection", "reflection", "thoughtful", "profound", "dream",
        "aspiration", "goal", "legacy", "impact"
    ],
    "professional": [
        "work", "career", "job", "business", "professional", "office",
        "colleague", "boss", "team", "project", "meeting", "presentation",
        "leadership", "management", "industry", "company", "corporate",
        "skill", "experience", "achievement", "success"
    ],
    "wouldYouRather": [
        "would you rather", "would you prefer", "choose between",
        "pick one", "option a or b", "this or that", "either or",
        "if you had to choose", "which would you pick"
    ],
    "thisOrThat": [
        "coffee or tea", "beach or mountains", "city or country",
        "summer or winter", "day or night", "morning or evening",
        "breakfast or dinner", "movie or book", "music or silence",
        "or", "versus", "vs"
    ]
}

def call_convex_api(action: str, data: Dict = None) -> Optional[Dict]:
    """Make a call to the Convex HTTP API."""
    try:
        url = f"{CONVEX_URL}/api/{action}"
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, headers=headers, json=data or {})
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error calling Convex API ({action}): {e}")
        return None

def get_all_questions() -> List[Dict]:
    """Fetch all questions from the database."""
    print("📥 Fetching all questions...")
    result = call_convex_api("query/questions/getQuestions")
    
    if result is None:
        print("❌ Failed to fetch questions")
        return []
    
    print(f"✅ Found {len(result)} questions")
    return result

def determine_category(question_text: str, tags: Optional[List[str]] = None) -> str:
    """
    Determine the category for a question based on its text and tags.
    Returns the category ID or 'random' if no specific category is found.
    """
    text_lower = question_text.lower()
    tags_lower = [tag.lower() for tag in (tags or [])]
    
    # Check for would you rather patterns first (most specific)
    if any(pattern in text_lower for pattern in CATEGORY_KEYWORDS["wouldYouRather"]):
        return "wouldYouRather"
    
    # Check for this or that patterns
    if any(pattern in text_lower for pattern in CATEGORY_KEYWORDS["thisOrThat"]):
        return "thisOrThat"
    
    # Check tags first
    for tag in tags_lower:
        for category, keywords in CATEGORY_KEYWORDS.items():
            if tag in keywords:
                return category
    
    # Check question text
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            return category
    
    # Additional heuristics
    if any(word in text_lower for word in ["childhood", "growing up", "school days", "memory"]):
        return "deep"
    
    if any(word in text_lower for word in ["dream", "fantasy", "imagine", "magic", "superpower"]):
        return "fun"
    
    # Default to random if no specific category is found
    return "random"

def update_question_category(question_id: str, text: str, category: str, tags: Optional[List[str]] = None) -> bool:
    """Update a question's category in the database."""
    try:
        result = call_convex_api("mutation/questions/updateQuestion", {
            "id": question_id,
            "text": text,
            "category": category,
            "tags": tags or []
        })
        return result is not None
    except Exception as e:
        print(f"Error updating question {question_id}: {e}")
        return False

def main():
    """Main function to populate categories for all questions."""
    print("🚀 Starting category population script...")
    print("="*60)
    
    # Fetch all questions
    questions = get_all_questions()
    
    if not questions:
        print("❌ No questions found or error fetching questions")
        return
    
    # Track statistics
    stats = {
        "total": len(questions),
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "categories": {}
    }
    
    print(f"\n📊 Processing {len(questions)} questions...")
    print("-" * 60)
    
    # Process each question
    for i, question in enumerate(questions, 1):
        question_id = question["_id"]
        current_category = question.get("category")
        question_text = question.get("text", "")
        tags = question.get("tags", [])
        
        print(f"\n[{i}/{len(questions)}] Question: {question_text[:60]}...")
        
        # Skip if already has a category
        if current_category:
            print(f"   ⏭️  Already has category: {current_category}")
            stats["skipped"] += 1
            continue
        
        # Determine category
        category = determine_category(question_text, tags)
        
        print(f"   🏷️  Determined category: {category}")
        print(f"   📝 Text: {question_text[:80]}...")
        print(f"   🏷️  Tags: {tags}")
        
        # Update the question
        success = update_question_category(question_id, question_text, category, tags)
        
        if success:
            print(f"   ✅ Successfully updated to category: {category}")
            stats["updated"] += 1
            stats["categories"][category] = stats["categories"].get(category, 0) + 1
        else:
            print(f"   ❌ Failed to update category")
            stats["errors"] += 1
        
        # Add a small delay to avoid rate limiting
        time.sleep(0.2)
    
    # Print final statistics
    print("\n" + "="*60)
    print("📈 FINAL STATISTICS")
    print("="*60)
    print(f"Total questions processed: {stats['total']}")
    print(f"Successfully updated: {stats['updated']}")
    print(f"Skipped (already categorized): {stats['skipped']}")
    print(f"Errors: {stats['errors']}")
    
    if stats["categories"]:
        print("\nCategory distribution:")
        for category, count in sorted(stats["categories"].items()):
            percentage = (count / stats["updated"]) * 100
            print(f"  {category}: {count} ({percentage:.1f}%)")
    
    print("\n✅ Category population script completed!")

if __name__ == "__main__":
    # Instructions for setup
    print("🔧 SETUP INSTRUCTIONS:")
    print("1. Create a .env file in the project root with:")
    print("   CONVEX_URL=https://your-deployment.convex.cloud")
    print("   CONVEX_API_KEY=your-api-key")
    print("2. Install python-dotenv: pip install python-dotenv")
    print("3. Run the script: python scripts/scratch.py")
    print("\n" + "="*60)
    
    # Check if configuration is set
    if CONVEX_URL == "https://your-deployment.convex.cloud" or API_KEY == "your-api-key":
        print("❌ Please create a .env file with your Convex credentials!")
        print("   Create .env file in the project root with:")
        print("   CONVEX_URL=https://your-deployment.convex.cloud")
        print("   CONVEX_API_KEY=your-api-key")
    else:
        print(f"✅ Using Convex URL: {CONVEX_URL}")
        print(f"✅ API Key configured: {'*' * 10}{API_KEY[-4:] if len(API_KEY) > 4 else '***'}")
        main()
