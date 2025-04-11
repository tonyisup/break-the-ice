#!/usr/bin/env python3
"""
Script to generate tags for existing questions that don't have tags.
This script uses the Google Gemini API to generate tags and updates the database.
"""

import os
import json
import time
import argparse
import pyodbc
import google.generativeai as genai
from dotenv import load_dotenv
import re

# Load environment variables
load_dotenv()

# Initialize Gemini client
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

def get_db_connection():
    """Create a connection to the SQL Server database."""
    connection_string = os.getenv("DATABASE_URL")
    if not connection_string:
        raise ValueError("DATABASE_URL environment variable is not set")
    
    # Parse the connection string to extract components
    if "integratedSecurity=true" in connection_string:
        # For integrated security, we don't need credentials
        parts = connection_string.replace("sqlserver://", "").split(";")
        server = parts[0]
        database = next((p.split("=")[1] for p in parts if p.startswith("database=")), "")
        # Use trusted connection for Windows auth
        conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};Trusted_Connection=yes;"
    else:
        # Handle standard connection string with credentials
        parts = connection_string.replace("sqlserver://", "").split(";")
        server = parts[0]
        database = next((p.split("=")[1] for p in parts if p.startswith("database=")), "")
        username = next((p.split("=")[1] for p in parts if p.startswith("user=")), "")
        password = next((p.split("=")[1] for p in parts if p.startswith("password=")), "")
        
        # Create connection string for pyodbc
        conn_str = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};UID={username};PWD={password}"
    return pyodbc.connect(conn_str)

def generate_tags_for_question(question_text):
    """Generate tags for a question using Gemini API."""
    try:
        prompt = f"""Generate 3-5 relevant tags for this icebreaker question. 
Tags should be short, descriptive words or phrases that categorize the question.

Question: "{question_text}"

Format the response as a JSON array of strings, for example:
["funny", "personal", "reflective"]

Return ONLY the JSON array, nothing else."""

        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)
        
        # Extract the JSON array from the response
        content = response.text.strip()
        if content.startswith('```json'):
            content = content[7:-3]  # Remove ```json and ```
        elif content.startswith('```'):
            content = content[3:-3]  # Remove ``` and ```
            
        tags = json.loads(content)
        return tags
    except Exception as e:
        print(f"Error generating tags: {e}")
        return []

def get_questions_without_tags(conn, limit=0):
    """Get questions that don't have any tags."""
    cursor = conn.cursor()
    
    query = """
    SELECT q.id, q.text
    FROM [ice].[Question] q
    LEFT JOIN [ice].[QuestionTag] qt ON q.id = qt.questionId
    WHERE qt.questionId IS NULL
    """
    
    if limit > 0:
        query += f" TOP {limit}"
        
    cursor.execute(query)
    questions = [{"id": row[0], "text": row[1]} for row in cursor.fetchall()]
    cursor.close()
    
    return questions

def get_or_create_tag(conn, tag_name):
    """Get an existing tag or create a new one."""
    cursor = conn.cursor()
    
    try:
        # Check if tag exists
        cursor.execute("SELECT id FROM [ice].[Tag] WHERE name = ?", tag_name)
        result = cursor.fetchone()
        
        if result:
            tag_id = result[0]
        else:
            # Create new tag
            cursor.execute(
                "INSERT INTO [ice].[Tag] (name, createdAt) VALUES (?, GETUTCDATE())",
                tag_name
            )
            conn.commit()
            # Get the newly created tag's ID
            cursor.execute("SELECT id FROM [ice].[Tag] WHERE name = ?", tag_name)
            result = cursor.fetchone()
            if not result:
                raise Exception(f"Failed to retrieve ID for newly created tag: {tag_name}")
            tag_id = result[0]
        
        return tag_id
    except Exception as e:
        print(f"Error in get_or_create_tag: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()

def create_question_tag(conn, question_id, tag_id):
    """Create a relationship between a question and a tag."""
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "INSERT INTO [ice].[QuestionTag] (questionId, tagId, createdAt) VALUES (?, ?, GETUTCDATE())",
            question_id, tag_id
        )
        
        conn.commit()
    except Exception as e:
        print(f"Error in create_question_tag: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()

def main():
    parser = argparse.ArgumentParser(description="Generate tags for questions without tags")
    parser.add_argument("--limit", type=int, default=0, help="Limit the number of questions to process (0 for all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update the database")
    args = parser.parse_args()

    conn = None
    try:
        # Connect to the database
        print("Connecting to database...")
        conn = get_db_connection()
        print("Connected successfully!")
        
        # Get questions without tags
        print("Fetching questions without tags...")
        questions = get_questions_without_tags(conn, args.limit)
        
        print(f"Found {len(questions)} questions without tags")
        
        for i, question in enumerate(questions):
            print(f"Processing question {i+1}/{len(questions)}: {question['text'][:50]}...")
            
            # Generate tags
            tags = generate_tags_for_question(question['text'])
            
            if not tags:
                print(f"  No tags generated for question {question['id']}")
                continue
                
            print(f"  Generated tags: {tags}")
            
            if args.dry_run:
                print("  [DRY RUN] Would create tags in database")
                continue
                
            # Create tags and associate with question
            for tag_name in tags:
                # Create or get tag
                tag_id = get_or_create_tag(conn, tag_name)
                
                # Create question-tag relationship
                create_question_tag(conn, question['id'], tag_id)
                
            print(f"  Added {len(tags)} tags to question {question['id']}")
            
            # Add a small delay to avoid rate limiting
            time.sleep(1)
            
        print("Tag generation complete!")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    main() 