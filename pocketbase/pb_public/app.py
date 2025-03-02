import os
from flask import Flask, request, render_template_string
import pdfplumber
import pandas as pd
import matplotlib.pyplot as plt
import re
import matplotlib

matplotlib.use('Agg')  # Prevents issues with running Matplotlib in Flask

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure necessary directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('static', exist_ok=True)


# Load HTML content from a file
def load_html_content(filename):
    try:
        file_path = os.path.join(os.path.dirname(__file__), filename)
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    except Exception as e:
        print(f"Error loading HTML content: {e}")
        return "<h1>Error loading page</h1>"


# Save the uploaded PDF file
def save_pdf_file(pdf_file):
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_file.filename)
        pdf_file.save(file_path)
        return file_path
    except Exception as e:
        print(f"Error saving file: {e}")
        return None


# Extract specific elements from a PDF
def extract_elements_from_pdf(pdf_file_path, element_name):
    try:
        with pdfplumber.open(pdf_file_path) as pdf:
            rows = []
            for page in pdf.pages:
                text = page.extract_text()
                if text is None:
                    continue
                lines = text.split('\n')
                for line in lines:
                    row = line.split()
                    rows.append(row)

        df = pd.DataFrame(rows)
        element_value = extract_elements(df, element_name)
        return element_value if element_value is not None else 0  # Default to 0 if not found
    except Exception as e:
        print(f"Error extracting elements from {pdf_file_path}: {e}")
        return 0


# Extract elements based on predefined patterns
def extract_elements(df, element_name):
    patterns = {
        "Haemoglobin": re.compile(r"Haemoglobin\s*\(Hb\)\s*([\d\.]+)", re.IGNORECASE),
        "Platelets": re.compile(r"Platelet\s*count\s*([\d,\.]+)", re.IGNORECASE),
        "RBC": re.compile(r"Erythrocyte\s*\(RBC\)\s*Count\s*([\d\.]+)", re.IGNORECASE),
        "WBC": re.compile(r"Total\s*Leucocytes\s*\(WBC\)\s*count\s*([\d,\.]+)", re.IGNORECASE)
    }

    element_pattern = patterns.get(element_name)
    if element_pattern is None:
        return None

    extracted_values = []
    for index, row in df.iterrows():
        text = ' '.join(row.astype(str))
        matches = element_pattern.findall(text)
        for match in matches:
            try:
                extracted_values.append(float(match.replace(',', '')))
            except ValueError:
                continue

    return sum(extracted_values) / len(extracted_values) if extracted_values else None


# Generate visual comparison for all elements
def visualize_all_elements(elements_dict):
    num_reports = len(elements_dict['Haemoglobin'])

    if num_reports == 0:
        return None  # No data available

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    haemo_data = [x if x is not None else 0 for x in elements_dict['Haemoglobin']]
    platelets_data = [x if x is not None else 0 for x in elements_dict['Platelets']]
    rbc_data = [x if x is not None else 0 for x in elements_dict['RBC']]
    wbc_data = [x if x is not None else 0 for x in elements_dict['WBC']]

    axes[0, 0].bar(range(num_reports), haemo_data, color='#A3C1DA')  # Light blue
    axes[0, 0].set_title('Haemoglobin Levels (12-16 gm/dL)')
    axes[0, 0].set_ylabel('gm/dL')

    axes[0, 1].bar(range(num_reports), platelets_data, color='#6BAED6')  # Medium blue
    axes[0, 1].set_title('Platelets Levels (140,000 - 440,000 /µl)')
    axes[0, 1].set_ylabel('10^3 / µl')

    axes[1, 0].bar(range(num_reports), rbc_data, color='#3182BD')  # Dark blue
    axes[1, 0].set_title('RBC Levels (4.2 - 5.4 mill/cu.mm)')
    axes[1, 0].set_ylabel('mill/cu.mm')

    axes[1, 1].bar(range(num_reports), wbc_data, color='#08519C')  # Very dark blue
    axes[1, 1].set_title('WBC Levels (4,300 - 10,300 cells/cu.mm)')
    axes[1, 1].set_ylabel('cells/cu.mm')

    plt.tight_layout()
    image_path = os.path.join('static', 'comparison.png')
    plt.savefig(image_path)
    plt.close()
    
    return f"/{image_path}"  # Return relative path for Flask to serve


# Remove file after processing
def clean_up(file_path):
    if os.path.exists(file_path):
        os.remove(file_path)


# Homepage
@app.route('/')
def index():
    html_content = load_html_content('analysis.html')
    return render_template_string(html_content)


# Analyze blood reports (PDFs)
@app.route('/analyze', methods=['POST'])
def analyze_blood():
    try:
        uploaded_files = request.files.getlist('reports')

        if not uploaded_files:
            return "No files uploaded.", 400

        if len(uploaded_files) > 10:
            uploaded_files = uploaded_files[:10]  # Limit max 10 reports

        elements_dict = {
            'Haemoglobin': [],
            'Platelets': [],
            'RBC': [],
            'WBC': []
        }

        for pdf_file in uploaded_files:
            if pdf_file and pdf_file.filename:
                file_path = save_pdf_file(pdf_file)
                if file_path:
                    haemoglobin = extract_elements_from_pdf(file_path, 'Haemoglobin')
                    platelets = extract_elements_from_pdf(file_path, 'Platelets')
                    rbc = extract_elements_from_pdf(file_path, 'RBC')
                    wbc = extract_elements_from_pdf(file_path, 'WBC')

                    elements_dict['Haemoglobin'].append(haemoglobin)
                    elements_dict['Platelets'].append(platelets)
                    elements_dict['RBC'].append(rbc)
                    elements_dict['WBC'].append(wbc)

                    clean_up(file_path)

        image_path = visualize_all_elements(elements_dict)
        if image_path is None:
            return "No valid data found in reports.", 400

        result_html_content = load_html_content('result.html')
        return render_template_string(result_html_content, img_path=image_path)

    except Exception as e:
        print(f"Error during analysis: {e}")
        return "An error occurred during the analysis. Please check the logs for more details.", 500


# Run Flask App on Port 8091
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8095)