import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

genai.configure(api_key="AIzaSyBlGK09eqARRLBHuQ45_dEzKl7W4KzlrKk")

@app.route("/chatbot", methods=["POST"])
def chatbot():
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    model = genai.GenerativeModel("gemini-1.5-pro-latest")  # Updated model name
    response = model.generate_content(user_message)

    return jsonify({"response": response.text})

if __name__ == "__main__":
    app.run(debug=True,port = 5011)