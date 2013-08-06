require 'spec_helper'

describe "Users" do
  describe "Sign up" do

    it "finds the sign-up page" do
      visit out_path
      click_link "Sign Up"
      within "h2" do
        page.should have_content "Sign Up"
      end
    end

    it "registers" do
      visit new_user_registration_path
      expect{
        fill_in "Username", with: "veed"
        fill_in "Email", with: "veedgrape@gmail.com"
        fill_in "Password", with: "12341234"
        fill_in "Password Confirmation", with: "12341234"
        click_button "sign up"}.to change(User, :count).by(1)

      page.should have_content "Welcome! You have signed up successfully."
    end
  end

  describe "Log in" do

    it "Logs in from the front page" do
      visit out_path

      fill_in "Email or Username", with: "veed"
      fill_in "Password", with: "12341234"
      click_button "LOG IN"

      page.should have_content "Signed in successfully."
      page.should have_content "signed in as veed"
      page.should have_content "LOG OUT"
      page.should have_content "Main Portal"
    end
  end
end