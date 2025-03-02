document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const uniquepassword = document.getElementById('uniquepassword').value;

    try {
        // Fetch user with the provided email and unique password
        const response = await fetch(`http://127.0.0.1:8090/api/collections/users/records?filter=email="${encodeURIComponent(email)}" && uniquepassword="${encodeURIComponent(uniquepassword)}"`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.items.length > 0) {
                // Redirect to files page with email as a query parameter
                window.location.href = `files.html?email=${encodeURIComponent(email)}`;
            } else {
                alert('Login failed. Check your credentials.');
            }
        } else {
            alert('Error during login.');
        }
    } catch (error) {
        console.error('Error during login:', error);
        alert('An error occurred. Please try again later.');
    }
});