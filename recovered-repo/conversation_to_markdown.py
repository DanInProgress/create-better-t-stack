#!/usr/bin/env python3
"""
Convert Claude Code conversation JSON export to readable markdown format.
"""

import json
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional
import re

class ConversationMarkdownGenerator:
    def __init__(self, json_file: str):
        self.json_file = json_file
        self.data = None
        self.events_by_id = {}
        self.tool_results = {}

    def load_data(self):
        """Load and parse the JSON file."""
        with open(self.json_file, 'r') as f:
            self.data = json.load(f)

        # Create lookup maps
        for event in self.data['data']:
            if 'uuid' in event:
                self.events_by_id[event['uuid']] = event

            # Store tool results from user messages
            if event.get('type') == 'user' and 'tool_use_result' in event:
                self.tool_results[event.get('parent_tool_use_id')] = event['tool_use_result']

    def extract_session_info(self) -> Dict[str, Any]:
        """Extract session metadata from system events."""
        system_events = [e for e in self.data['data'] if e.get('type') == 'system']
        if not system_events:
            return {}

        # Get the first system event for basic info
        sys_event = system_events[0]

        # Look for result events for metrics
        result_events = [e for e in self.data['data'] if e.get('type') == 'result']
        metrics = {}
        if result_events:
            res = result_events[0]
            metrics = {
                'duration': res.get('duration_ms', 0) / 1000,
                'cost': res.get('total_cost_usd', 0),
                'turns': res.get('num_turns', 0),
                'errors': res.get('errors', [])
            }

        return {
            'model': sys_event.get('model', 'Unknown'),
            'cwd': sys_event.get('cwd', 'Unknown'),
            'tools': sys_event.get('tools', []),
            'session_id': sys_event.get('session_id', 'Unknown'),
            'metrics': metrics
        }

    def format_content(self, content: Any) -> str:
        """Format message content appropriately."""
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            formatted = []
            for item in content:
                if item.get('type') == 'text':
                    formatted.append(item.get('text', ''))
                elif item.get('type') == 'tool_use':
                    formatted.append(self.format_tool_use(item))
            return '\n\n'.join(filter(None, formatted))
        return str(content)

    def format_tool_use(self, tool_use: Dict[str, Any]) -> str:
        """Format a tool use block."""
        name = tool_use.get('name', 'unknown')
        params = tool_use.get('input', {})

        # Special formatting for different tool types
        if name == 'Bash':
            cmd = params.get('CommandLine', '')
            return f"```bash\n{cmd}\n```"
        elif name == 'Read':
            file_path = params.get('file_path', '')
            return f"📖 Reading: `{file_path}`"
        elif name == 'Edit':
            file_path = params.get('file_path', '')
            return f"✏️ Editing: `{file_path}`"
        elif name == 'Write':
            file_path = params.get('TargetFile', '')
            return f"📝 Writing: `{file_path}`"
        elif name == 'Grep':
            pattern = params.get('Query', '')
            path = params.get('SearchPath', '')
            return f"🔍 Searching: `{pattern}` in `{path}`"
        elif name == 'WebFetch':
            url = params.get('Url', '')
            return f"🌐 Fetching: {url}"
        else:
            return f"🔧 {name}: {json.dumps(params, indent=2)}"

    def get_tool_result(self, tool_use_id: str) -> Optional[str]:
        """Get the result for a tool use."""
        result = self.tool_results.get(tool_use_id)
        if result:
            if isinstance(result, dict):
                if 'output' in result:
                    return result['output']
                elif 'newTodos' in result:  # TodoWrite result
                    return json.dumps(result['newTodos'], indent=2)
            elif isinstance(result, str):
                return result
        return None

    def generate_conversation_section(self) -> str:
        """Generate the main conversation section."""
        sections = []

        # Filter for user and assistant messages
        messages = [e for e in self.data['data']
                   if e.get('type') in ['user', 'assistant']]

        for msg in messages:
            msg_type = msg.get('type', 'unknown')

            if msg_type == 'user':
                content = msg.get('message', {}).get('content', '')
                if isinstance(content, str) and content.strip():
                    sections.append(f"\n## 👤 User\n\n{content}")
            elif msg_type == 'assistant':
                message = msg.get('message', {})
                if 'content' in message:
                    content = self.format_content(message['content'])
                    if content.strip():
                        sections.append(f"\n## 🤖 Assistant\n\n{content}")

        return '\n'.join(sections)

    def generate_tool_summary_section(self) -> str:
        """Generate a summary of all tool uses."""
        sections = ["\n# 🛠️ Tool Usage Summary\n"]

        # Collect all tool uses
        tool_uses = []
        for event in self.data['data']:
            if event.get('type') == 'assistant':
                message = event.get('message', {})
                if isinstance(message.get('content'), list):
                    for item in message['content']:
                        if item.get('type') == 'tool_use':
                            tool_uses.append((event, item))

        # Group by tool type
        tool_counts = {}
        for _, tool_use in tool_uses:
            name = tool_use.get('name', 'unknown')
            tool_counts[name] = tool_counts.get(name, 0) + 1

        sections.append("## Tool Usage Counts\n")
        for tool, count in sorted(tool_counts.items()):
            sections.append(f"- **{tool}**: {count} uses")

        return '\n'.join(sections)

    def generate_session_summary(self) -> str:
        """Generate session summary section."""
        info = self.extract_session_info()
        metrics = info.get('metrics', {})

        summary = [
            "\n# 📊 Session Summary",
            f"\n**Model**: {info.get('model', 'Unknown')}",
            f"**Working Directory**: `{info.get('cwd', 'Unknown')}`",
            f"**Session ID**: `{info.get('session_id', 'Unknown')}`",
        ]

        if metrics:
            summary.extend([
                f"\n**Duration**: {metrics.get('duration', 0):.2f} seconds",
                f"**Total Cost**: ${metrics.get('cost', 0):.4f}",
                f"**Number of Turns**: {metrics.get('turns', 0)}",
            ])

            if metrics.get('errors'):
                summary.append("\n**Errors**:")
                for error in metrics['errors']:
                    summary.append(f"- {error}")

        return '\n'.join(summary)

    def generate_toc(self, num_sections: int) -> str:
        """Generate table of contents."""
        toc = [
            "# Table of Contents",
            "- [Session Summary](#session-summary)",
            "- [Conversation](#conversation)",
            "- [Tool Usage Summary](#-tool-usage-summary)",
        ]
        return '\n'.join(toc)

    def generate_markdown(self) -> str:
        """Generate the complete markdown document."""
        if not self.data:
            self.load_data()

        # Generate sections
        toc = self.generate_toc(3)
        session_summary = self.generate_session_summary()
        conversation = self.generate_conversation_section()
        tool_summary = self.generate_tool_summary_section()

        # Combine all sections
        markdown = [
            "# Claude Code Conversation Export",
            f"*Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*",
            "\n---\n",
            toc,
            "\n---\n",
            session_summary,
            "\n---\n",
            "# 💬 Conversation",
            conversation,
            tool_summary,
            "\n---\n",
            "*End of conversation*"
        ]

        return '\n'.join(markdown)

def main():
    if len(sys.argv) != 2:
        print("Usage: python conversation_to_markdown.py <conversation.json>")
        sys.exit(1)

    json_file = sys.argv[1]
    generator = ConversationMarkdownGenerator(json_file)
    markdown = generator.generate_markdown()

    # Output to file
    output_file = json_file.replace('.json', '.md')
    with open(output_file, 'w') as f:
        f.write(markdown)

    print(f"Markdown saved to: {output_file}")

if __name__ == "__main__":
    main()
