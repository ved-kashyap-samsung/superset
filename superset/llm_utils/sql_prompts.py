prompts = {
    "NL TO SQL": """
{schema}

-- Using valid SQLite, give SQL query for following question.
-- {natural_language_query}
SQL Query:
""",

    "SQL_DATA_SUMMARIZE": """
Write a concise summary of the following:

Question: {natural_language_query}

Answer:

{data}

CONCISE SUMMARY:
"""
}
