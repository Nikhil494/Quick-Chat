import axios from "axios";

export const url = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const axiosInstance = axios.create({
    headers: {
        authorization: `Bearer ${localStorage.getItem('token')}`
    }
});
