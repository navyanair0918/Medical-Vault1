document.getElementById("insuranceForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById("name").value,
        dob: document.getElementById("dob").value,
        gender: document.getElementById("gender").value,
        marital_status: document.getElementById("marital_status").value,
        occupation: document.getElementById("occupation").value,
        address: document.getElementById("address").value,
        contact: document.getElementById("contact").value,
        email: document.getElementById("email").value,
        nominee: document.getElementById("nominee").value,
        nominee_relationship: document.getElementById("nominee_relationship").value,
        policy_type: document.getElementById("policy_type").value,
        sum_insured: parseFloat(document.getElementById("sum_insured").value) || 0,
        premium_amount: parseFloat(document.getElementById("premium_amount").value) || 0,
        policy_start_date: document.getElementById("policy_start_date").value,
        policy_expiry_date: document.getElementById("policy_expiry_date").value,
        renewed: false
    };

    try {
        const response = await fetch("http://127.0.0.1:8090/api/collections/insurance/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            alert("Policy added successfully!");
            document.getElementById("insuranceForm").reset();
        } else {
            const errorData = await response.json();
            alert("Failed to add policy: " + (errorData.message || "Unknown error"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error adding policy. Please try again.");
    }
});

// Renewal Feature
document.getElementById("renewPolicy").addEventListener("click", async function () {
    const policyId = document.getElementById("policyId").value.trim();

    if (!policyId) {
        alert("Please enter a valid Policy ID.");
        return;
    }

    try {
        // Fetch current policy details
        const policyResponse = await fetch(`http://127.0.0.1:8090/api/collections/insurance/records/${policyId}`);
        if (!policyResponse.ok) {
            alert("Policy not found!");
            return;
        }

        const policyData = await policyResponse.json();
        if (!policyData.policy_expiry_date) {
            alert("Invalid policy data.");
            return;
        }

        // Calculate new expiry date (1 year added)
        let newExpiryDate = new Date(policyData.policy_expiry_date);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
        newExpiryDate = newExpiryDate.toISOString().split("T")[0];

        // Update policy in PocketBase
        const updateResponse = await fetch(`http://127.0.0.1:8090/api/collections/insurance/records/${policyId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policy_expiry_date: newExpiryDate, renewed: true })
        });

        if (updateResponse.ok) {
            alert("Policy renewed successfully!");
        } else {
            const updateError = await updateResponse.json();
            alert("Failed to renew policy: " + (updateError.message || "Unknown error"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error renewing policy. Please try again.");
    }
});

