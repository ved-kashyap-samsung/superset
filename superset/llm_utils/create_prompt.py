from superset.llm_utils.sql_prompts import prompts

def create_prompt(prompt_type, query = "", schema = "", data = "", sql = ""):
    prompt_template = prompts[prompt_type]
    prompt = prompt_template.format(natural_language_query = query, schema = schema, data = data, sql=sql)
    return prompt

def create_table_schema(table_name, schema_name, schema_type):
    schema = f"CREATE TABLE {table_name} (\n"
    for i in range(len(schema_name)):
        schema += f"{schema_name[i]} {schema_type[i]}"
        if(i != len(schema_name) - 1):
            schema += ","
        schema += "\n"
    schema += ")"
    return schema
