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
def main():
    try:
        client = get_convex_client()
        print(f"✅ Connected to Convex backend")
        client.mutation("questions:dropPromptUsed")
        print(f"✅ Dropped prompt used column")
    except Exception as e:
        print(f"❌ Failed to connect to Convex: {e}")
        return