import os
from flask import Flask, request, render_template_string
import pdfplumber
import re
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend for Matplotlib

app = Flask(__name__)

# Define upload and static folder
UPLOAD_FOLDER = 'uploads'
STATIC_FOLDER = 'static'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Create directories if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

def load_html_content(filename):
    """Loads the HTML content from a file."""
    try:
        with open(filename, 'r') as file:
            return file.read()
    except Exception as e:
        print(f"Error loading HTML content: {e}")
        return "<h1>Error loading page</h1>"

def save_pdf_file(pdf_file):
    """Saves the uploaded PDF file to disk."""
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_file.filename)
        pdf_file.save(file_path)
        return file_path
    except Exception as e:
        print(f"Error saving file: {e}")
        return None

def extract_values_from_pdf(pdf_path):
    """Extracts specific health-related values from a PDF using regex."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join([page.extract_text() for page in pdf.pages if page.extract_text()])

        patterns = {
            "Fasting Sugar": re.compile(r"Fasting\s*Blood\s*Sugar\s*[:\-]?\s*([\d\.]+)", re.IGNORECASE),
            "Postprandial Sugar": re.compile(r"Postprandial\s*Blood\s*Sugar\s*[:\-]?\s*([\d\.]+)", re.IGNORECASE),
            "HbA1c": re.compile(r"HbA1c\s*(?:\(%\))?\s*[:\-]?\s*([\d\.]+)", re.IGNORECASE),
            "Total Cholesterol": re.compile(r"Total\s*Cholesterol\s*[:\-]?\s*([\d\.]+)", re.IGNORECASE)
        }

        extracted_values = {key: None for key in patterns.keys()}

        for key, pattern in patterns.items():
            match = pattern.search(text)
            if match:
                extracted_values[key] = float(match.group(1).replace(",", ""))

        print(f"Extracted values from {pdf_path}: {extracted_values}")  # Debugging log
        return extracted_values
    except Exception as e:
        print(f"Error extracting values from PDF: {e}")
        return None

def visualize_all_elements(elements_dict):
    """Generates a bar chart for all health parameters and saves it."""
    num_reports = len(elements_dict['Fasting Sugar'])

    if num_reports == 0:
        return "No data to display."

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # Replace None values with 0 for graphing
    fasting_sugar = [x if x is not None else 0 for x in elements_dict['Fasting Sugar']]
    postprandial_sugar = [x if x is not None else 0 for x in elements_dict['Postprandial Sugar']]
    hba1c = [x if x is not None else 0 for x in elements_dict['HbA1c']]
    cholesterol = [x if x is not None else 0 for x in elements_dict['Total Cholesterol']]

    axes[0, 0].bar(range(num_reports), fasting_sugar, color='#FFA07A')
    axes[0, 0].set_title('Fasting Sugar Levels (70-100 mg/dL)')
    axes[0, 0].set_ylabel('mg/dL')

    axes[0, 1].bar(range(num_reports), postprandial_sugar, color='#FF7F50')
    axes[0, 1].set_title('Postprandial Sugar Levels (140-200 mg/dL)')
    axes[0, 1].set_ylabel('mg/dL')

    axes[1, 0].bar(range(num_reports), hba1c, color='#DC143C')
    axes[1, 0].set_title('HbA1c Levels (4.0 - 5.6%)')
    axes[1, 0].set_ylabel('%')

    axes[1, 1].bar(range(num_reports), cholesterol, color='#8B0000')
    axes[1, 1].set_title('Cholesterol Levels (< 200 mg/dL)')
    axes[1, 1].set_ylabel('mg/dL')

    plt.tight_layout()
    image_path = os.path.join(STATIC_FOLDER, 'diabetes_analysis.png')
    plt.savefig(image_path)
    plt.close()

    return image_path

def clean_up(file_path):
    """Removes the uploaded file after processing."""
    if os.path.exists(file_path):
        os.remove(file_path)

@app.route('/')
def index():
    """Serves the main webpage."""
    html_content = load_html_content('analysis.html')
    return render_template_string(html_content)

@app.route('/analyze_diabetes', methods=['POST'])
def analyze_diabetes():
    """Handles file uploads, extracts health data, and visualizes it."""
    try:
        print("Received a request on /analyze")  # Debugging log
        uploaded_files = request.files.getlist('reports')

        if not uploaded_files:
            print("No files uploaded.")  
            return "No files uploaded.", 400

        if len(uploaded_files) > 10:
            uploaded_files = uploaded_files[:10]  # Limit to 10 files

        elements_dict = {
            'Fasting Sugar': [],
            'Postprandial Sugar': [],
            'HbA1c': [],
            'Total Cholesterol': []
        }

        for pdf_file in uploaded_files:
            if pdf_file and pdf_file.filename:
                file_path = save_pdf_file(pdf_file)
                if file_path:
                    extracted_values = extract_values_from_pdf(file_path)

                    elements_dict['Fasting Sugar'].append(extracted_values['Fasting Sugar'])
                    elements_dict['Postprandial Sugar'].append(extracted_values['Postprandial Sugar'])
                    elements_dict['HbA1c'].append(extracted_values['HbA1c'])
                    elements_dict['Total Cholesterol'].append(extracted_values['Total Cholesterol'])

                    clean_up(file_path)

        image_path = visualize_all_elements(elements_dict)

        result_html_content = load_html_content('diabetes_result.html')
        return render_template_string(result_html_content, img_path=image_path)

    except Exception as e:
        print(f"Error during analysis: {e}")
        return "An error occurred during the analysis. Please check the logs for more details.", 500

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)