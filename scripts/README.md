# Tag Generation Script

This script generates tags for existing questions in the database that don't have tags yet. It uses the Google Gemini API to generate relevant tags based on the question content.

## Prerequisites

- Python 3.7+
- Google API key
- Access to the SQL Server database
- ODBC Driver 17 for SQL Server

## Setup

1. Install the required dependencies:

```bash
pip install -r requirements.txt
```

2. Make sure your `.env` file contains the necessary environment variables:

```
GOOGLE_API_KEY=your_google_api_key
DATABASE_URL=sqlserver://username:password@server:port/database
```

3. Install the ODBC Driver for SQL Server:
   - Windows: Download and install from Microsoft's website
   - Linux: Follow the instructions at https://docs.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server

## Usage

Run the script with:

```bash
python generate_tags.py
```

### Options

- `--limit N`: Process only N questions (default: process all)
- `--dry-run`: Run without making changes to the database

### Examples

Process all questions without tags:
```bash
python generate_tags.py
```

Process only 10 questions:
```bash
python generate_tags.py --limit 10
```

Test run without making changes:
```bash
python generate_tags.py --dry-run
```

## How It Works

1. The script connects directly to the SQL Server database using pyodbc
2. It queries the database for questions that don't have any tags
3. For each question, it uses the Google Gemini API to generate 3-5 relevant tags
4. It creates the tags in the database (or reuses existing tags with the same name)
5. It associates the tags with the question

The script includes error handling and rate limiting to avoid overwhelming the Gemini API. 