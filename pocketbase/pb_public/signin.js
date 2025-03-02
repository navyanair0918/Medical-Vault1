document.getElementById("signup-form").addEventListener("submit", async function (e) {
    e.preventDefault(); // Prevent default form submission

    const email = document.getElementById("email").value;
    const uniquepassword = document.getElementById("uniquepassword").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    // Ensure passwords match
    if (uniquepassword !== confirmPassword) {
        alert("Passwords do not match");
        return;
    }

    // Create data object
    const data = {
        email: email,
        uniquepassword: uniquepassword,
        username: email.split('@')[0] // Example: username from email
    };

    try {
        // Make a POST request to create a new user
        const response = await fetch('http://127.0.0.1:8090/api/collections/users/records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text(); // Read the response text
            throw new Error(`Error: ${errorText}`);
        }

        const record = await response.json();
        console.log('User created successfully:', record);

        alert("Sign-up successful!");
        // Redirect to files page with email as a query parameter
        window.location.href = `files.html?email=${encodeURIComponent(email)}`;
    } catch (error) {
        alert("Error signing up: " + error.message);
    }
});