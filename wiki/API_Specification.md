# Git Journal Daemon - Local Event API Specification

This document specifies the local HTTP API exposed by the `git-journal-daemon`. This API allows external tools, primarily the TaskForce VSCode extension, to send event data (e.g., file reads, custom TaskForce events) to the daemon for journaling.

Refer to the [Event Journaling Design](./Event_Journaling_Design.md) for the overall architecture and how these events are processed and stored.

## 1. Base URL and Port Management

*   **Host:** The API server will always run on `localhost` (i.e., `127.0.0.1`).
*   **Port:**
    *   The daemon will dynamically allocate an available port upon startup from a predefined range (e.g., starting at a default like `3000` or a user-configurable base port).
    *   **Port Communication:** Upon successful binding, the daemon will print the chosen port number to its standard output (stdout) in the format:
        ```
        JOURNAL_DAEMON_PORT: <port_number>
        ```
    *   The client application (e.g., TaskForce VSCode extension) launching the daemon is responsible for capturing this stdout message, parsing the port number, and using it for all subsequent API requests to this specific daemon instance. This mechanism ensures correct communication in multi-instance scenarios (multiple projects open).

## 2. Authentication

No authentication is implemented for this local API. It is assumed that only trusted local applications (like the TaskForce VSCode extension) will interact with it, and binding to `localhost` limits external access.

## 3. Endpoints

### 3.1. Log Event

*   **Endpoint:** `POST /log_event`
*   **Description:** Submits an event to be journaled. The daemon will queue this event and include it in the Git Note of the next journal commit it creates.
*   **Request Body:**
    *   **Content-Type:** `application/json`
    *   **Schema:**
        ```json
        {
          "type": "string", // Required. Type of the event (e.g., "file_read", "task_start").
          "path": "string", // Optional, but typically required for file-related events. Relative path to the relevant file within the repository.
          "timestamp": "string", // Required. ISO 8601 UTC timestamp of when the event occurred (e.g., "2025-05-11T10:30:00Z").
          "source": "string", // Optional. Identifier for the source of the event (e.g., "vscode_extension_taskforce", "cli_tool_project_genie").
          "data": "object" // Optional. Any additional structured data specific to the event type.
        }
        ```
    *   **Example Request Body (File Read):**
        ```json
        {
          "type": "file_read",
          "path": "src/main.ts",
          "timestamp": "2025-05-11T12:34:56Z",
          "source": "vscode_extension_taskforce"
        }
        ```
    *   **Example Request Body (Custom Event):**
        ```json
        {
          "type": "taskforce_task_completed",
          "timestamp": "2025-05-11T12:35:00Z",
          "source": "vscode_extension_taskforce",
          "data": {
            "taskId": "tf-123",
            "durationMs": 50000
          }
        }
        ```

*   **Success Response:**
    *   **Status Code:** `202 Accepted`
    *   **Body:** Empty.
    *   The `202 Accepted` status indicates that the daemon has received the event and queued it for processing. It does not guarantee that the event has been written to the journal yet.

*   **Error Responses:**
    *   **Status Code:** `400 Bad Request`
        *   **Body (JSON):** `{ "error": "Descriptive error message" }`
        *   **Reason:** Invalid JSON payload, missing required fields, or malformed data.
    *   **Status Code:** `500 Internal Server Error`
        *   **Body (JSON):** `{ "error": "Internal server error" }`
        *   **Reason:** An unexpected error occurred within the daemon while trying to process the request.

## 4. Data Storage

Events logged via this API are queued by the daemon and then written into a Git Note associated with the next commit made to the `journal` branch. The note is a JSON object containing an `events` array, as detailed in the [Event Journaling Design](./Event_Journaling_Design.md#3-event-data-structure-example).

## 5. Client Responsibilities

*   **Daemon Lifecycle Management:** The client (e.g., VSCode extension) is responsible for starting the `git-journal-daemon` for the relevant project/repository.
*   **Port Discovery:** The client must capture and parse the `JOURNAL_DAEMON_PORT` from the daemon's stdout to determine the correct port for API calls.
*   **Error Handling:** Implement robust error handling for API requests (e.g., retries for transient network issues, logging for persistent errors).
*   **Event Throttling/Debouncing (Optional but Recommended):** For high-frequency events (like cursor movements if they were to be logged), the client should consider implementing its own throttling or debouncing mechanisms to avoid overwhelming the daemon's API. For file reads (on open), this is less critical but still good practice if multiple "read" signals could be generated quickly for the same file.