from google.adk.runtime import LocalRuntime
from agent.agent import root_agent

runtime = LocalRuntime()

if __name__ == "__main__":
    query = "Analyze AAPL and recommend a short-term strategy."

    result = runtime.run(root_agent, user_input=query)
    print(result.output)
