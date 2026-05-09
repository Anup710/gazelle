Full pipeline
0. input video or YT link or direct transcript -> transcript extraction with correct metadata and format
1. creation of the knowledge base (based on which the user queries are answered) - embedding stored in vector db 
2. input of user query (text or voice), validation, intent capture, load and append context, system prompt etc, fetch relevant chunks, make a response (RAG pipeline)
3. show response correctly (rendering) + option to "listen" to the response in input language
4. continue chat thread once started 
5. UI/ UX