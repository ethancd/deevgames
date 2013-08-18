require 'spec_helper'

describe "Posts" do
  describe "View posts" do

    before(:all) do
      FactoryGirl.create(:user)
      FactoryGirl.create(:post, body: "lorem\n"*10)
    end

    it "sees the blog" do

      visit blog_path

      page.should have_content "The Deev-elopment Blog"
      page.should have_content "posted by"
      page.should have_content "More..."
      page.should have_content "Comments"

      page.should_not have_content "Edit this post"

      page.should have_selector "h3"
      page.should have_selector "article"
      page.should have_selector "img"
      page.should have_selector "time"
    end

    context "admin" do

      subject(:user) {
        u = FactoryGirl.build(:user)
        u.admin = true
        u.save
        u
      }

      it "can edit a post" do

        visit blog_path

        fill_in "Email or Username", with: user.username
        fill_in "Password", with: user.password
        click_button "LOG IN"

        visit blog_path

        first('.post').click_link "Edit this post"

        within "h3" do
          page.should have_content "Edit Post"
        end
      end
    end

  end
end
