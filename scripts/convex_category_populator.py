#!/usr/bin/env python3
"""
Script to populate categories using the official Python Convex library.
This script uses ConvexClient to directly interact with the Convex backend.
"""

import json
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import the Convex client
try:
    from convex import ConvexClient
except ImportError:
    print("❌ Convex Python library not found. Please install it first:")
    print("   pip install convex")
    exit(1)

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

def get_convex_client() -> ConvexClient:
    """Initialize and return a Convex client."""
    # Get the deployment URL from environment variable
    deployment_url = os.getenv('CONVEX_DEPLOYMENT_URL')
    
    if not deployment_url:
        print("❌ CONVEX_DEPLOYMENT_URL environment variable not set.")
        print("Please set it in your .env file or environment.")
        print("You can find your deployment URL in the Convex dashboard under Settings.")
        exit(1)
    
    # Initialize the client
    client = ConvexClient(deployment_url)
    
    # Set debug mode if requested
    if os.getenv('CONVEX_DEBUG', 'false').lower() == 'true':
        client.set_debug(True)
        print("🔍 Debug mode enabled")
    
    # Set auth token if provided
    auth_token = os.getenv('CONVEX_AUTH_TOKEN')
    if auth_token:
        client.set_auth(auth_token)
        print("🔐 Authentication token set")
    
    return client

def determine_category(question_text: str, tags: Optional[List[str]] = None) -> str:
    """Determine the category for a question based on its text and tags."""
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

def get_all_questions(client: ConvexClient) -> List[Dict]:
    """Fetch all questions using Convex client."""
    print("📥 Fetching all questions...")
    
    try:
        # Query all questions from the database
        questions = client.query("questions:list")
        return questions if questions else []
    except Exception as e:
        print(f"❌ Error fetching questions: {e}")
        return []

def update_question_categories(client: ConvexClient, updates: List[Dict]) -> bool:
    """Update question categories using Convex client."""
    try:
        # Call the mutation to update categories
        result = client.mutation("questions:updateCategories", {"updates": updates})
        return result is not None
    except Exception as e:
        print(f"❌ Error updating categories: {e}")
        return False

def main():
    """Main function to populate categories for all questions."""
    print("🚀 Starting category population script (Python Convex library version)...")
    print("="*70)
    
    # Initialize Convex client
    try:
        client = get_convex_client()
        print(f"✅ Connected to Convex backend")
    except Exception as e:
        print(f"❌ Failed to connect to Convex: {e}")
        return
    
    # Fetch all questions
    questions = get_all_questions(client)
    
    if not questions:
        print("❌ No questions found or error fetching questions")
        return
    
    print(f"✅ Found {len(questions)} questions")
    
    # Track statistics
    stats = {
        "total": len(questions),
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "categories": {}
    }
    
    # Prepare updates
    updates = []
    
    print(f"\n📊 Processing {len(questions)} questions...")
    print("-" * 70)
    
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
        
        # Add to updates list
        updates.append({
            "id": question_id,
            "category": category
        })
        
        stats["categories"][category] = stats["categories"].get(category, 0) + 1
    
    # Update categories in batches
    if updates:
        print(f"\n🔄 Updating {len(updates)} questions...")
        
        # Process in batches of 10 to avoid timeouts
        batch_size = 10
        for i in range(0, len(updates), batch_size):
            batch = updates[i:i + batch_size]
            print(f"   Processing batch {i//batch_size + 1}/{(len(updates) + batch_size - 1)//batch_size}")
            
            success = update_question_categories(client, batch)
            if success:
                stats["updated"] += len(batch)
                print(f"   ✅ Successfully updated batch")
            else:
                stats["errors"] += len(batch)
                print(f"   ❌ Failed to update batch")
    
    # Print final statistics
    print("\n" + "="*70)
    print("📈 FINAL STATISTICS")
    print("="*70)
    print(f"Total questions processed: {stats['total']}")
    print(f"Successfully updated: {stats['updated']}")
    print(f"Skipped (already categorized): {stats['skipped']}")
    print(f"Errors: {stats['errors']}")
    
    if stats["categories"]:
        print("\nCategory distribution:")
        for category, count in sorted(stats["categories"].items()):
            percentage = (count / stats["updated"]) * 100 if stats["updated"] > 0 else 0
            print(f"  {category}: {count} ({percentage:.1f}%)")
    
    print("\n✅ Category population script completed!")

if __name__ == "__main__":
    print("🔧 SETUP INSTRUCTIONS:")
    print("1. Install the Convex Python library: pip install convex")
    print("2. Install python-dotenv: pip install python-dotenv")
    print("3. Create a .env file with your Convex deployment URL:")
    print("   CONVEX_DEPLOYMENT_URL=https://your-deployment.convex.cloud")
    print("   CONVEX_AUTH_TOKEN=your-auth-token (optional)")
    print("   CONVEX_DEBUG=true (optional, for debugging)")
    print("4. Make sure you're in the project directory with convex/ folder")
    print("5. Run the script: python scripts/convex_category_populator.py")
    print("\n" + "="*70)
    
    main()
