#!/usr/bin/env python3
"""
Extract files from Claude Code HAR export.
This script parses a HAR file containing git_proxy/file requests and responses,
extracts the base64-encoded file content, and reconstructs the directory tree.
"""

import json
import base64
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def parse_har_file(har_path: str) -> List[Dict]:
    """Parse HAR file and extract file entries."""
    with open(har_path, 'r', encoding='utf-8') as f:
        har_data = json.load(f)

    file_entries = []

    # Find all git_proxy/file requests
    for entry in har_data.get('log', {}).get('entries', []):
        request = entry.get('request', {})
        response = entry.get('response', {})

        # Check if this is a git_proxy/file request
        if 'git_proxy/file' in request.get('url', ''):
            # Parse request body to get file path
            request_body = request.get('postData', {}).get('text', '')
            try:
                request_data = json.loads(request_body)
                file_path = request_data.get('path', '')
            except json.JSONDecodeError:
                continue

            # Parse response body to get file content
            response_body = response.get('content', {}).get('text', '')
            try:
                response_data = json.loads(response_body)
                content_b64 = response_data.get('content', '')
                file_name = response_data.get('name', '')
            except json.JSONDecodeError:
                continue

            if content_b64 and file_path:
                file_entries.append({
                    'path': file_path,
                    'name': file_name,
                    'content_b64': content_b64,
                    'url': request.get('url', '')
                })

    return file_entries


def decode_content(content_b64: str) -> bytes:
    """Decode base64 content."""
    try:
        return base64.b64decode(content_b64)
    except Exception as e:
        print(f"Error decoding base64 content: {e}")
        return b''


def create_directory_tree(output_dir: str, file_entries: List[Dict]) -> None:
    """Create directory tree and write files."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Extracting {len(file_entries)} files to {output_dir}/")

    for entry in file_entries:
        file_path = entry['path']
        file_name = entry['name']
        content_b64 = entry['content_b64']

        # Decode content
        content = decode_content(content_b64)

        # Create full file path
        full_path = output_path / file_path

        # Create parent directories if they don't exist
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Write file
        try:
            with open(full_path, 'wb') as f:
                f.write(content)
            print(f"✓ {file_path}")
        except Exception as e:
            print(f"✗ Error writing {file_path}: {e}")


def main():
    if len(sys.argv) != 3:
        print("Usage: python extract_files_from_har.py <har_file> <output_directory>")
        sys.exit(1)

    har_file = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.exists(har_file):
        print(f"Error: HAR file '{har_file}' not found")
        sys.exit(1)

    try:
        # Parse HAR file
        print(f"Parsing HAR file: {har_file}")
        file_entries = parse_har_file(har_file)

        if not file_entries:
            print("No file entries found in HAR file")
            sys.exit(1)

        # Create directory tree
        create_directory_tree(output_dir, file_entries)

        print(f"\nSuccessfully extracted {len(file_entries)} files to {output_dir}/")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
