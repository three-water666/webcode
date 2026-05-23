# webcode FAQ

Language: English | [中文](FAQ_GUIDE.md)

## What if `@webcode` or `/webcode` does not trigger on the page?

Make sure there is a space before the trigger word, for example:

```text
Read the current project structure. /webcode
```

If the page still does not trigger, click the browser extension popup and use its button to manually copy the initialization prompt, then paste it into the current chat and send it.

## What if the AI returns a tool call and the tool succeeds, but the page does not change?

Refresh the current page. After the refresh, webcode scans the page again and reruns the tool-result delivery flow for tool calls that still need to be handled.

## How can I see which tools the AI called before?

Click the browser extension popup and enable logs. The summary column records each tool call, so you can review which tools the AI called and in what order.
