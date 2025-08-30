# Category Population Scripts

These Python scripts help populate the `category` field for existing questions in your Convex database.

## 📋 Prerequisites

1. **Python 3.7+** installed
2. **Convex Python library** installed: `pip install convex`
3. **Python dependencies** installed: `pip install -r requirements.txt`

## 🔧 Setup

### 1. Install Dependencies
```bash
cd scripts
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the project root (same level as `convex/` folder):

```bash
# Copy the example file
cp scripts/env.example .env

# Edit the .env file with your actual values
```

Your `.env` file should contain:
```env
CONVEX_DEPLOYMENT_URL=https://your-deployment.convex.cloud
# Optional: CONVEX_AUTH_TOKEN=your-auth-token-here
# Optional: CONVEX_DEBUG=true
```

### 3. Get Your Convex Credentials

1. **Convex Deployment URL**: Found in your Convex dashboard under Settings
2. **Auth Token** (optional): If your functions require authentication

## 🚀 Usage

### Python Convex Library Script (Recommended)

```bash
python scripts/convex_category_populator.py
```

**Features:**
- Uses official Convex Python library
- Direct API calls to your Convex backend
- Better error handling and debugging
- Progress tracking with statistics
- Batch processing to avoid timeouts

## 📊 What the Script Does

1. **Fetch All Questions**: Get all questions from your database using `questions:list`
2. **Analyze Each Question**: Determine appropriate category based on:
   - Question text keywords
   - Existing tags
   - Pattern matching (e.g., "would you rather")
   - Heuristics for edge cases
3. **Skip Already Categorized**: Don't overwrite existing categories
4. **Batch Updates**: Update questions efficiently using `questions:updateCategories`
5. **Provide Statistics**: Show results and category distribution

## 🏷️ Category Mapping

The script automatically categorizes questions into:

- **Fun & Silly**: humor, jokes, embarrassing, weird, etc.
- **Deep & Thoughtful**: meaning, purpose, philosophy, life, etc.
- **Professional**: work, career, business, leadership, etc.
- **Would You Rather**: choice-based questions
- **This or That**: preference questions with "or"
- **Random**: fallback for unclear questions

## 📈 Expected Output

```
🚀 Starting category population script (Python Convex library version)...
✅ Connected to Convex backend
📥 Fetching all questions...
✅ Found 25 questions

📊 Processing 25 questions...
[1/25] Question: What's your favorite ice cream flavor?...
   🏷️  Determined category: fun
   ✅ Successfully updated

📈 FINAL STATISTICS
Total questions processed: 25
Successfully updated: 20
Skipped (already categorized): 3
Errors: 2

Category distribution:
  fun: 8 (40.0%)
  deep: 5 (25.0%)
  professional: 3 (15.0%)
  wouldYouRather: 2 (10.0%)
  thisOrThat: 2 (10.0%)
```

## 🔍 Troubleshooting

### Common Issues

1. **"Convex Python library not found"**
   ```bash
   pip install convex
   ```

2. **"ModuleNotFoundError: No module named 'dotenv'"**
   ```bash
   pip install python-dotenv
   ```

3. **"CONVEX_DEPLOYMENT_URL environment variable not set"**
   - Copy `scripts/env.example` to `.env`
   - Update with your actual Convex deployment URL

4. **"Error calling Convex API"**
   - Check your `CONVEX_DEPLOYMENT_URL`
   - Ensure the URL is correct and accessible
   - Check if you need authentication

### Debug Mode

Add `CONVEX_DEBUG=true` to your `.env` file for more verbose output.

## 🔒 Security Notes

- Never commit your `.env` file to version control
- The `.env` file is already in `.gitignore`
- Deployment URLs are safe to share (they're public)

## 📝 Customization

You can modify the category keywords in the script:

```python
CATEGORY_KEYWORDS = {
    "fun": ["funny", "joke", "silly", ...],
    "deep": ["meaning", "purpose", "philosophy", ...],
    # Add your own categories or keywords
}
```

## 🔧 Required Convex Functions

The script requires these functions to be defined in your `convex/questions.ts`:

- `questions:list` - Query to get all questions
- `questions:updateCategories` - Mutation to update multiple question categories

These functions are already included in the updated `questions.ts` file.
