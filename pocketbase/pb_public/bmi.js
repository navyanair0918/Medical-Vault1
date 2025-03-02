function calculateBMI() {
    const weight = document.getElementById("weight").value;
    const height = document.getElementById("height").value;
    const ageGroup = document.getElementById("age-group").value;
    const alertBox = document.createElement("div");

    // Remove previous alert
    const existingAlert = document.querySelector(".alert");
    if (existingAlert) existingAlert.remove();

    // Validate input
    if (!weight || !height) {
        showAlert("Please fill in both weight and height.");
        return;
    }

    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);

    // Validation for adults
    if (ageGroup === "adult") {
        if (weightNum < 30 || weightNum > 500) {
            showAlert("Weight for adults must be between 30 kg and 500 kg.");
            return;
        }
        if (heightNum < 100 || heightNum > 250) {
            showAlert("Height for adults must be between 100 cm and 250 cm.");
            return;
        }
    }

    // Validation for children
    if (ageGroup === "child") {
        if (weightNum < 5 || weightNum > 150) {
            showAlert("Weight for children must be between 5 kg and 150 kg.");
            return;
        }
        if (heightNum < 50 || heightNum > 200) {
            showAlert("Height for children must be between 50 cm and 200 cm.");
            return;
        }
    }

    

    const heightInMeters = heightNum / 100;
    const bmi = weightNum / (heightInMeters * heightInMeters);
    document.getElementById("bmi-result").textContent = bmi.toFixed(1);

    let category = "";
    let advice = "";
    let diet ="";
    let exercise = "";
    let motivation = "";

    if (bmi <= 18.4) {
        category = "Underweight";
        advice = "You may need to eat a more balanced diet with healthy calories. Consider consulting a nutritionist.";
        diet = "Include high-calorie foods like nuts, dairy, and protein-rich meals.";
        exercise = "Focus on strength training exercises like squats and push-ups.";
        motivation = "Strength doesn't come from what you can do, it comes from overcoming the things you once thought you couldn't.";
    } else if (bmi >= 18.5 && bmi <= 24.9) {
        category = "Normal";
        advice = "Great job! Maintain a balanced diet and stay active.";
        diet = "Continue eating a mix of proteins, vegetables, and healthy fats.";
        exercise = "Engage in 30 minutes of moderate exercise like jogging or yoga.";
        motivation = "Your health is an investment, not an expense. Keep going!";
    } else if (bmi >= 25 && bmi <= 39.9) {
        category = "Overweight";
        advice = "Try adopting a healthier lifestyle with balanced meals and regular physical activity.";
        diet = "Reduce sugar intake, focus on fiber-rich and protein-packed meals.";
        exercise = "Cardio exercises like brisk walking or cycling can help.";
        motivation = "Small steps in the right direction can turn into big changes over time.";
    } else {
        category = "Obese";
        advice = "It is recommended to consult a doctor for a personalized health plan.";
        diet = "Adopt a low-carb, high-fiber diet with portion control.";
        exercise = "Start with low-impact activities like swimming or walking.";
        motivation = "Every journey begins with a single step. Your health journey starts today!";
        
    }

    document.getElementById("bmi-category").textContent = category;
    document.getElementById("health-advice").textContent = advice;
    document.getElementById("diet-plan").textContent = diet;
    document.getElementById("exercise-plan").textContent = exercise;
    document.getElementById("motivation").textContent = motivation;
}

function showAlert(message) {
    const alertBox = document.createElement("div");
    alertBox.className = "alert";
    alertBox.textContent = message;
    document.querySelector(".calculator-box").appendChild(alertBox);
    alertBox.style.display = "block";
}

function clearForm() {
    document.getElementById("weight").value = '';
    document.getElementById("height").value = '';
    document.getElementById("bmi-result").textContent = '--';
    document.getElementById("bmi-category").textContent = '--';
    document.getElementById("health advice").textContent = '--';
    document.getElementById("diet-plan").textContent = '--';
    document.getElementById("exercise-plan").textContent = '--';
    document.getElementById("motivation").textContent = '--';

    const alertBox = document.querySelector(".alert");
    if (alertBox) alertBox.remove();
}